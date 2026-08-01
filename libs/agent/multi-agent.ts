/**
 * Multi-agent orchestration plan for Layerkit integrations.
 *
 * Deterministic planner (not an LLM): fans work into roles that coding-agent
 * platforms can spawn in parallel (host Task/threads/background agents).
 *
 * mode=full: scan (discover+style) → research → … → handoff
 * mode=heal: scan (status+style) → research from contract → … → handoff
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Agent role in the multi-agent team. */
export type MultiAgentRole =
  | 'orchestrator'
  | 'discoverer'
  | 'stylist'
  | 'researcher'
  | 'designer'
  | 'author'
  | 'privacy'
  | 'integrator'
  | 'verifier'
  | 'checker';

export type MultiAgentPhaseId =
  | 'scan'
  | 'research'
  | 'design_author'
  | 'privacy'
  | 'integrate'
  | 'verify'
  | 'handoff';

export type AgentCapability = 'read-only' | 'read-write' | 'execute' | 'all';

export interface MultiAgentTask {
  /** Stable id: role or role:vendor */
  id: string;
  role: MultiAgentRole;
  phase: MultiAgentPhaseId;
  /** Human label for UI / spawn */
  label: string;
  skill: string;
  /** Vendor scope when fan-out is per-vendor */
  vendor?: string;
  /** May run concurrently with other tasks that share the same parallelGroup */
  parallelGroup: string;
  /** True when tasks in the same group may run in parallel */
  parallel: boolean;
  capability: AgentCapability;
  /** Exact CLI commands this agent should run first */
  cli: string[];
  /** Self-contained spawn prompt for a cold subagent */
  prompt: string;
  /** Completion criterion */
  doneWhen: string;
  requiresHuman?: boolean;
  /** Depends on task ids (soft ordering within plan) */
  dependsOn: string[];
}

export interface MultiAgentPhase {
  id: MultiAgentPhaseId;
  title: string;
  detail: string;
  /** Task ids in this phase */
  taskIds: string[];
  parallel: boolean;
  requiresHuman?: boolean;
}

export interface MultiAgentPlan {
  schemaVersion: 1;
  kind: 'multi_agent_plan';
  createdAt: string;
  repoRoot: string;
  projectDir: string;
  vendors: string[];
  moduleRoot?: string;
  mode: 'full' | 'heal';
  openapiPath?: string;
  goal: string;
  phases: MultiAgentPhase[];
  tasks: MultiAgentTask[];
  /** Max recommended concurrent agents (product guidance) */
  maxParallel: number;
  summary: string;
}

export interface BuildMultiAgentPlanOptions {
  repoRoot: string;
  projectDir: string;
  /** Vendors to fan out (empty → single generic research slot) */
  vendors?: string[];
  moduleRoot?: string;
  /** Scan root for discover/style/generate */
  root?: string;
  goal?: string;
  /** Cap parallel research/integrate workers (default 4) */
  maxParallel?: number;
  /** Include bootstrap-ish doctor in scan */
  includeDoctor?: boolean;
  mode?: 'full' | 'heal';
  openapiPath?: string;
}

const MULTI_AGENT_PLAN_REL = join('memory', 'runbooks', 'multi-agent-plan.md');
const MULTI_AGENT_PLAN_JSON_REL = join('out', 'multi-agent-plan.json');

/** Build multi-agent plan for integrate or contract heal. */
export function buildMultiAgentPlan(opts: BuildMultiAgentPlanOptions): MultiAgentPlan {
  const vendors = (opts.vendors ?? []).map((v) => v.trim()).filter(Boolean);
  const root = opts.root ?? opts.repoRoot;
  const moduleRoot = opts.moduleRoot;
  const maxParallel = Math.max(1, Math.min(opts.maxParallel ?? 4, 16));
  const mode = opts.mode === 'heal' ? 'heal' : 'full';
  const openapiPath = opts.openapiPath?.trim() || undefined;
  const goal =
    opts.goal?.trim() ||
    (mode === 'heal'
      ? vendors.length
        ? `Heal integration(s) ${vendors.join(', ')} from updated contract`
        : 'Heal integrations from updated contract'
      : vendors.length
        ? `Integrate vendor(s) ${vendors.join(', ')} into production datalayer`
        : 'Discover domain, research vendors, integrate into production datalayer');

  const tasks: MultiAgentTask[] = [];
  const phases: MultiAgentPhase[] = [];

  // --- Phase: scan ---
  const scanIds: string[] = [];
  if (opts.includeDoctor !== false) {
    const t = task({
      id: 'orchestrator:status',
      role: 'orchestrator',
      phase: 'scan',
      label: 'pipeline status',
      skill: 'layerkit-orchestrate-integration',
      parallelGroup: 'scan',
      parallel: true,
      capability: 'execute',
      cli: ['layerkit agent status', 'layerkit doctor'],
      prompt: scanOrchestratorPrompt(opts.projectDir, mode),
      doneWhen: 'Pipeline status printed; mode heal|full understood; doctor clean or expected warnings',
      dependsOn: [],
    });
    tasks.push(t);
    scanIds.push(t.id);
  }

  if (mode !== 'heal') {
    const discover = task({
      id: 'discoverer',
      role: 'discoverer',
      phase: 'scan',
      label: 'discover domain',
      skill: 'layerkit-discover-data-layer',
      parallelGroup: 'scan',
      parallel: true,
      capability: 'read-write',
      cli: [
        `layerkit discover scan --root ${shellQuote(root)}`,
        'layerkit memory list --type research',
      ],
      prompt: discovererPrompt(root, opts.projectDir),
      doneWhen: 'Domain events/fields discovered; research note or proposal with source:code',
      dependsOn: [],
    });
    tasks.push(discover);
    scanIds.push(discover.id);
  }

  const stylist = task({
    id: 'stylist',
    role: 'stylist',
    phase: 'scan',
    label: mode === 'heal' ? 'style + topology (heal)' : 'style + topology',
    skill: 'layerkit-align-client-style',
    parallelGroup: 'scan',
    parallel: true,
    capability: 'read-write',
    cli: [
      `layerkit style-profile scan --root ${shellQuote(root)}`,
      ...(mode === 'heal'
        ? []
        : [
            `layerkit generate --lang java --root ${shellQuote(root)}${moduleRoot ? ` --module-root ${shellQuote(moduleRoot)}` : ''}`,
          ]),
    ],
    prompt: stylistPrompt(root, opts.projectDir, moduleRoot, mode),
    doneWhen:
      mode === 'heal'
        ? 'Style profile in memory/runbooks; topology understood for direct source edits'
        : 'Style profile in memory/runbooks; INTEGRATE.md context when production module detected',
    dependsOn: [],
  });
  tasks.push(stylist);
  scanIds.push(stylist.id);

  phases.push({
    id: 'scan',
    title: mode === 'heal' ? 'Scan (heal)' : 'Scan',
    detail:
      mode === 'heal'
        ? 'Parallel: doctor/status + style/topology'
        : 'Parallel: doctor/status, domain discover, style + topology',
    taskIds: scanIds,
    parallel: true,
  });

  // --- Phase: research (contract-first; heal = pin + drift from OpenAPI/docs contract) ---
  const researchIds: string[] = [];
  const researchVendors = vendors.length ? vendors : ['<vendor>'];
  for (const vendor of researchVendors.slice(0, maxParallel * 2)) {
    const id = `researcher:${vendor}`;
    const vFlag = vendor === '<vendor>' ? 'VENDOR' : vendor;
    const oa =
      openapiPath ??
      `{projectDir}/out/contracts/${vFlag === 'VENDOR' ? '<vendor>' : vFlag}/openapi.json`;
    const t = task({
      id,
      role: 'researcher',
      phase: 'research',
      label: mode === 'heal' ? `contract update ${vendor}` : `research ${vendor}`,
      skill: 'layerkit-research-vendor',
      vendor: vendor === '<vendor>' ? undefined : vendor,
      parallelGroup: 'research',
      parallel: true,
      capability: 'read-write',
      cli: [
        vendor === '<vendor>' ? 'layerkit map list' : `layerkit map show ${vendor}`,
        mode === 'heal'
          ? `layerkit heal run --vendor ${vFlag} --openapi ${shellQuote(oa)}${moduleRoot ? ` --module-root ${shellQuote(moduleRoot)}` : ''}`
          : `layerkit heal run --vendor ${vFlag} --openapi ${shellQuote(oa)}${moduleRoot ? ` --module-root ${shellQuote(moduleRoot)}` : ''}`,
      ],
      prompt: researcherPrompt(vendor, opts.projectDir, mode, openapiPath, moduleRoot),
      doneWhen:
        mode === 'heal'
          ? `Heal rails complete for ${vendor}: drift/map recorded; source edit tasks identified`
          : `Map + source edit tasks for ${vendor} from structured contract ready`,
      dependsOn: scanIds,
    });
    tasks.push(t);
    researchIds.push(t.id);
  }
  phases.push({
    id: 'research',
    title: mode === 'heal' ? 'Research (contract heal)' : 'Research',
    detail:
      mode === 'heal'
        ? `Pin OpenAPI/docs contract → drift vs applied map (cap ~${maxParallel})`
        : `Parallel per vendor (cap ~${maxParallel}) — contract/docs evidence-first maps`,
    taskIds: researchIds,
    parallel: true,
  });

  // --- Phase: design + author processors ---
  const designIds: string[] = [];
  for (const vendor of researchVendors.slice(0, maxParallel * 2)) {
    const dep = `researcher:${vendor}`;
    const designer = task({
      id: `designer:${vendor}`,
      role: 'designer',
      phase: 'design_author',
      label: `design ${vendor}`,
      skill: 'layerkit-design-integration',
      vendor: vendor === '<vendor>' ? undefined : vendor,
      parallelGroup: 'design_author',
      parallel: true,
      capability: 'read-write',
      cli: [
        `layerkit design decide --vendor ${vendor === '<vendor>' ? 'VENDOR' : vendor}`,
      ],
      prompt: designerPrompt(vendor, opts.projectDir),
      doneWhen: 'linear_map vs flow decision recorded with evidence',
      dependsOn: [dep],
    });
    tasks.push(designer);
    designIds.push(designer.id);

    const author = task({
      id: `author:${vendor}`,
      role: 'author',
      phase: 'design_author',
      label: `processors ${vendor}`,
      skill: 'layerkit-author-processor',
      vendor: vendor === '<vendor>' ? undefined : vendor,
      parallelGroup: 'design_author',
      parallel: true,
      capability: 'read-write',
      cli: [
        'layerkit proposal validate ./proc.json',
        'layerkit proposal submit ./proc.json --by agent-author',
      ],
      prompt: authorPrompt(vendor, opts.projectDir),
      doneWhen: 'Processors cited; map fields reference processorId where needed',
      dependsOn: [dep],
    });
    tasks.push(author);
    designIds.push(author.id);
  }
  phases.push({
    id: 'design_author',
    title: 'Design + author',
    detail: 'Per-vendor design decision + processor authoring (parallel)',
    taskIds: designIds,
    parallel: true,
  });

  // --- Privacy (serial, human) ---
  const privacy = task({
    id: 'privacy',
    role: 'privacy',
    phase: 'privacy',
    label: 'privacy review',
    skill: 'layerkit-privacy-review',
    parallelGroup: 'privacy',
    parallel: false,
    capability: 'read-write',
    cli: ['layerkit doctor', 'layerkit memory list --type privacy'],
    prompt: privacyPrompt(opts.projectDir, vendors),
    doneWhen: 'PrivacyPolicy ready; fail-closed live rules with sources',
    dependsOn: designIds,
    requiresHuman: true,
  });
  tasks.push(privacy);
  phases.push({
    id: 'privacy',
    title: 'Privacy',
    detail: 'Serial + human when PII egress',
    taskIds: [privacy.id],
    parallel: false,
    requiresHuman: true,
  });

  const integrateVendors = vendors.length ? vendors : ['<vendor>'];
  let integrationBarrierIds = [privacy.id];

  // --- Integrate (per-vendor create + one registry owner) ---
  const integrateIds: string[] = [];
  if (mode !== 'heal') {
    for (const vendor of integrateVendors.slice(0, maxParallel * 2)) {
      const t = task({
        id: `integrator:${vendor}`,
        role: 'integrator',
        phase: 'integrate',
        label: `integrate ${vendor}`,
        skill: 'layerkit-generate-java',
        vendor: vendor === '<vendor>' ? undefined : vendor,
        parallelGroup: 'integrate-vendors',
        parallel: true,
        capability: 'read-write',
        cli: [
          `layerkit generate --lang java --mode integrate --vendor ${vendor === '<vendor>' ? 'VENDOR' : vendor}${moduleRoot ? ` --module-root ${shellQuote(moduleRoot)}` : ''} --root ${shellQuote(root)}`,
          'Read {projectDir}/out/INTEGRATE.md',
        ],
        prompt: integratorPrompt(vendor, opts.projectDir, moduleRoot, root),
        doneWhen: `Adapter/tests for ${vendor} in production module; no parallel facade`,
        dependsOn: [privacy.id],
      });
      tasks.push(t);
      integrateIds.push(t.id);
    }
    // Shared registry patch — single writer after vendor creates
    const registry = task({
      id: 'integrator:registry',
      role: 'integrator',
      phase: 'integrate',
      label: 'registry / router wire',
      skill: 'layerkit-generate-java',
      parallelGroup: 'integrate-shared',
      parallel: false,
      capability: 'read-write',
      cli: ['# patch registry/router per INTEGRATE.md after vendor adapters exist'],
      prompt: registryIntegratorPrompt(opts.projectDir, vendors, moduleRoot),
      doneWhen: 'All new vendors registered; router updated if needed; single registry owner',
      dependsOn: integrateIds,
    });
    tasks.push(registry);
    integrateIds.push(registry.id);
    integrationBarrierIds = [registry.id];

    phases.push({
      id: 'integrate',
      title: 'Integrate (production code)',
      detail: 'Parallel adapters per vendor, then serial registry/router',
      taskIds: integrateIds,
      parallel: false, // phase has internal parallel group + barrier
    });
  }

  // --- Verify ---
  const verifyIds: string[] = [];
  for (const vendor of integrateVendors.slice(0, maxParallel * 2)) {
    const t = task({
      id: `verifier:${vendor}`,
      role: 'verifier',
      phase: 'verify',
      label: `verify ${vendor}`,
      skill: 'layerkit-fix-from-dry-run',
      vendor: vendor === '<vendor>' ? undefined : vendor,
      parallelGroup: 'verify',
      parallel: true,
      capability: 'execute',
      cli: [
        `layerkit process dry-run --vendor ${vendor === '<vendor>' ? 'VENDOR' : vendor} --intent INTENT`,
      ],
      prompt: verifierPrompt(vendor, opts.projectDir),
      doneWhen: `Dry-run green for primary intents of ${vendor}`,
      dependsOn: integrationBarrierIds,
    });
    tasks.push(t);
    verifyIds.push(t.id);
  }
  const quality = task({
    id: 'verifier:quality',
    role: 'verifier',
    phase: 'verify',
    label: 'quality doctor',
    skill: 'layerkit-generate-java',
    parallelGroup: 'verify',
    parallel: true,
    capability: 'execute',
    cli: ['layerkit doctor --quality --strict'],
    prompt: qualityVerifierPrompt(opts.projectDir, moduleRoot),
    doneWhen: 'doctor --quality --strict green (JaCoCo on moduleRoot when Java)',
    dependsOn: integrationBarrierIds,
  });
  tasks.push(quality);
  verifyIds.push(quality.id);

  phases.push({
    id: 'verify',
    title: 'Verify',
    detail: 'Parallel dry-run per vendor + quality gate',
    taskIds: verifyIds,
    parallel: true,
  });

  // --- Handoff ---
  const checker = task({
    id: 'checker',
    role: 'checker',
    phase: 'handoff',
    label: 'checker assist',
    skill: 'layerkit-checker-assist',
    parallelGroup: 'handoff',
    parallel: false,
    capability: 'read-only',
    cli: ['layerkit agent status', 'layerkit promote --vendor VENDOR'],
    prompt: checkerPrompt(opts.projectDir, vendors),
    doneWhen: 'Risk checklist only; human approves/promotes',
    dependsOn: verifyIds,
    requiresHuman: true,
  });
  tasks.push(checker);
  phases.push({
    id: 'handoff',
    title: 'Handoff',
    detail: 'Checker read-only + human promote',
    taskIds: [checker.id],
    parallel: false,
    requiresHuman: true,
  });

  const parallelCount = tasks.filter((t) => t.parallel).length;
  const summary = [
    `mode=${mode}`,
    `${phases.length} phases`,
    `${tasks.length} agent tasks`,
    vendors.length ? `vendors: ${vendors.join(', ')}` : 'vendors: (assign per research)',
    openapiPath ? `openapi: ${openapiPath}` : '',
    `maxParallel≈${maxParallel}`,
    `${parallelCount} parallel-eligible tasks`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    schemaVersion: 1,
    kind: 'multi_agent_plan',
    createdAt: new Date().toISOString(),
    repoRoot: opts.repoRoot,
    projectDir: opts.projectDir,
    vendors,
    moduleRoot,
    mode,
    openapiPath,
    goal,
    phases,
    tasks,
    maxParallel,
    summary,
  };
}

/**
 * Markdown runbook for humans + coding agents.
 */
export function formatMultiAgentPlanMarkdown(plan: MultiAgentPlan): string {
  const lines: string[] = [
    '# Layerkit multi-agent plan',
    '',
    plan.goal,
    '',
    `- Created: ${plan.createdAt}`,
    `- Mode: **${plan.mode}**`,
    `- Project: \`${plan.projectDir}\``,
    `- Repo: \`${plan.repoRoot}\``,
    plan.moduleRoot ? `- Module: \`${plan.moduleRoot}\`` : '- Module: (detect via generate auto)',
    plan.openapiPath ? `- OpenAPI: \`${plan.openapiPath}\`` : '',
    `- Vendors: ${plan.vendors.length ? plan.vendors.map((v) => `\`${v}\``).join(', ') : '_(assign)_'}`,
    `- Max parallel: ${plan.maxParallel}`,
    `- Summary: ${plan.summary}`,
    '',
    '## How to run',
    '',
    '1. **Orchestrator**: `layerkit agent status`.',
    '2. Spawn **one subagent per task**; same `parallelGroup` may run concurrently.',
    '3. Do **not** start a phase until `dependsOn` tasks are done.',
    '4. **Research** from customer OpenAPI/docs — structured contract + drift, never invent.',
    plan.mode === 'heal'
      ? '5. **Heal** records drift/map; agents edit production source files directly; no `INTEGRATE.md` phase.'
      : '5. **Integrate** with `INTEGRATE.md` as context; agents author production code.',
    '6. **Checker** is read-only; humans approve/promote.',
    '',
    '```bash',
    plan.mode === 'heal'
      ? 'layerkit agent multi --vendor <v> --mode heal --openapi <contract.json> [--module-root <dir>]'
      : 'layerkit agent multi --vendor <v> [--module-root <dir>]',
    'layerkit agent status',
    'layerkit agent next',
    '```',
    '',
  ].filter((l) => l !== '');

  for (const phase of plan.phases) {
    lines.push(`## Phase: ${phase.title} (\`${phase.id}\`)`);
    lines.push('');
    lines.push(phase.detail);
    if (phase.requiresHuman) lines.push('');
    if (phase.requiresHuman) lines.push('**Requires human.**');
    lines.push('');
    lines.push(phase.parallel ? '_Tasks in this phase may run in parallel._' : '_Serial or barrier phase._');
    lines.push('');
    for (const id of phase.taskIds) {
      const t = plan.tasks.find((x) => x.id === id);
      if (!t) continue;
      lines.push(`### ${t.label} (\`${t.id}\`)`);
      lines.push('');
      lines.push(`- **Role:** ${t.role} · **Skill:** \`${t.skill}\``);
      lines.push(`- **Capability:** ${t.capability}${t.parallel ? ' · parallel' : ''}`);
      if (t.vendor) lines.push(`- **Vendor:** \`${t.vendor}\``);
      if (t.dependsOn.length) lines.push(`- **Depends on:** ${t.dependsOn.map((d) => `\`${d}\``).join(', ')}`);
      lines.push(`- **Done when:** ${t.doneWhen}`);
      lines.push('- **CLI:**');
      for (const c of t.cli) lines.push(`  - \`${c}\``);
      lines.push('- **Spawn prompt:**');
      lines.push('');
      lines.push('```');
      lines.push(t.prompt.trim());
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Forbidden');
  lines.push('');
  lines.push('- Inventing map fields/endpoints without sources[]');
  lines.push('- Parallel agents patching the **same** registry file (use integrator:registry only)');
  lines.push('- Self-approve in strict maker-checker');
  lines.push('- LLM on track()/adapter hot path');
  lines.push('- Scaffold-as-destination when INTEGRATE.md says integrate');
  lines.push('');

  return lines.join('\n');
}

/**
 * Write plan under projectDir (markdown runbook + JSON).
 */
export function writeMultiAgentPlanArtifacts(
  projectDir: string,
  plan: MultiAgentPlan,
): { mdPath: string; jsonPath: string } {
  const mdPath = join(projectDir, MULTI_AGENT_PLAN_REL);
  const jsonPath = join(projectDir, MULTI_AGENT_PLAN_JSON_REL);
  mkdirSync(join(mdPath, '..'), { recursive: true });
  mkdirSync(join(jsonPath, '..'), { recursive: true });
  writeFileSync(mdPath, formatMultiAgentPlanMarkdown(plan), 'utf8');
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  return { mdPath, jsonPath };
}

export function multiAgentPlanPaths(projectDir: string): { md: string; json: string } {
  return {
    md: join(projectDir, MULTI_AGENT_PLAN_REL),
    json: join(projectDir, MULTI_AGENT_PLAN_JSON_REL),
  };
}

/** Tasks eligible to start given completed task ids. */
export function readyMultiAgentTasks(
  plan: MultiAgentPlan,
  completedTaskIds: string[],
): MultiAgentTask[] {
  const done = new Set(completedTaskIds);
  return plan.tasks.filter((t) => {
    if (done.has(t.id)) return false;
    return t.dependsOn.every((d) => done.has(d));
  });
}

/** Group ready tasks by parallelGroup for a spawn panel. */
export function groupReadyByParallel(
  ready: MultiAgentTask[],
): Record<string, MultiAgentTask[]> {
  const groups: Record<string, MultiAgentTask[]> = {};
  for (const t of ready) {
    const g = t.parallelGroup;
    if (!groups[g]) groups[g] = [];
    groups[g]!.push(t);
  }
  return groups;
}

// --- helpers ---

function task(
  partial: Omit<MultiAgentTask, never> & MultiAgentTask,
): MultiAgentTask {
  return partial;
}

function shellQuote(p: string): string {
  if (/[\s"'\\]/.test(p)) return `"${p.replace(/"/g, '\\"')}"`;
  return p;
}

function scanOrchestratorPrompt(projectDir: string, mode: 'full' | 'heal'): string {
  return [
    'You are the Layerkit orchestrator (scan phase).',
    'Use tools to run CLI in the repo; do not invent results.',
    `Pipeline mode: ${mode}`,
    '1. Run: layerkit agent status',
    '2. Run: layerkit doctor',
    `3. Project store: ${projectDir}`,
    mode === 'heal'
      ? '4. Heal mode: next should be research (contract pin + drift).'
      : '4. Report: next pipeline step, doctor warnings, whether maps exist.',
    '5. Do not author vendor maps in this role.',
  ].join('\n');
}

function discovererPrompt(root: string, projectDir: string): string {
  return [
    'You are the Layerkit discoverer agent.',
    'Skill: layerkit-discover-data-layer',
    `Scan root: ${root}`,
    `Project dir: ${projectDir}`,
    'Run: layerkit discover scan --root <root>',
    'Deny secrets (.env, keys, pem). Emit domain findings with source:code only.',
    'Write/update memory research notes. Do not invent vendor endpoints.',
    'Not used in heal mode (contract update).',
  ].join('\n');
}

function stylistPrompt(
  root: string,
  projectDir: string,
  moduleRoot: string | undefined,
  mode: 'full' | 'heal',
): string {
  return [
    'You are the Layerkit style + topology agent.',
    'Skill: layerkit-align-client-style',
    `Mode: ${mode}`,
    `Scan root: ${root}`,
    moduleRoot ? `Module root: ${moduleRoot}` : 'Detect moduleRoot from topology.',
    `Project dir: ${projectDir}`,
    '1. layerkit style-profile scan --root <root>',
    ...(mode === 'heal'
      ? ['2. Summarize package, DI, HTTP/SDK client pattern, entrypoints for direct heal edits.']
      : [
          '2. layerkit generate --lang java --root <root> [--module-root ...]',
          '3. Read INTEGRATE.md as context; inspect real code before editing production adapters.',
          '4. Summarize package, DI, HTTP/SDK client pattern, entrypoints.',
        ]),
    'Do not implement adapters yet.',
  ].join('\n');
}

function researcherPrompt(
  vendor: string,
  projectDir: string,
  mode: 'full' | 'heal',
  openapiPath?: string,
  moduleRoot?: string,
): string {
  return [
    `You are the Layerkit heal agent for vendor: ${vendor}`,
    'Skill: layerkit-research-vendor',
    `Project dir: ${projectDir}`,
    `Mode: ${mode}`,
    openapiPath ? `OpenAPI: ${openapiPath}` : 'OpenAPI: customer-supplied path',
    moduleRoot ? `Module root: ${moduleRoot}` : 'Module root: pass --module-root',
    '1. layerkit map show <vendor>',
    '2. layerkit heal run --vendor <v> --openapi <file> --module-root <dir>',
    '3. If the user supplied docs, first curate a structured contract with citations, then use it as --openapi.',
    '4. Review out/CONTRACT_DRIFT.json',
    '5. If removed/added fields are semantic renames, pass --rename-decisions with evidence',
    '6. Edit real source/tests yourself, then verify with dry-run + quality before promote',
    'Evidence only from the supplied contract. Breaking drift → human before promote.',
  ].join('\n');
}

function designerPrompt(vendor: string, projectDir: string): string {
  return [
    `You are the Layerkit design agent for vendor: ${vendor}`,
    'Skills: layerkit-design-integration, layerkit-design-flow',
    `Project dir: ${projectDir}`,
    'Decide linear_map vs flow vs hybrid from evidence (oauth, multi-call, foreach).',
    'Run: layerkit design decide --vendor ... with flags matching evidence.',
    'Prefer flat VendorMap unless multi-step is required.',
  ].join('\n');
}

function authorPrompt(vendor: string, projectDir: string): string {
  return [
    `You are the Layerkit processor author for vendor: ${vendor}`,
    'Skill: layerkit-author-processor',
    `Project dir: ${projectDir}`,
    'Author pure processors (email/phone/time/hash) with mandatory doc citations.',
    'No I/O in processors. Validate + submit proposals. Link field rows to processorId.',
  ].join('\n');
}

function privacyPrompt(projectDir: string, vendors: string[]): string {
  return [
    'You are the Layerkit privacy agent.',
    'Skill: layerkit-privacy-review',
    `Project dir: ${projectDir}`,
    vendors.length ? `Vendors: ${vendors.join(', ')}` : 'All vendors in project.',
    'Strengthen PrivacyPolicy; consent/hash/redact with sources; fail-closed live.',
    'Stop and flag human when legal basis is unclear. Do not promote live yourself.',
  ].join('\n');
}

function integratorPrompt(
  vendor: string,
  projectDir: string,
  moduleRoot: string | undefined,
  root: string,
): string {
  return [
    `You are the Layerkit integrator for vendor: ${vendor}`,
    'Skill: layerkit-generate-java (integrate mode)',
    `Project dir: ${projectDir}`,
    `Scan root: ${root}`,
    moduleRoot ? `Module root: ${moduleRoot}` : 'Use project.generate.moduleRoot / INTEGRATE.md context',
    '1. layerkit generate --lang java --mode integrate --vendor <vendor> [--module-root]',
    '2. Read out/INTEGRATE.md as topology/context; do not treat it as generated source.',
    '3. Edit production code beside existing adapters.',
    '4. Do NOT patch the shared registry (another agent owns integrator:registry).',
    '5. Add tests mirroring sibling vendor tests. No LLM on hot path. No invented fields.',
  ].join('\n');
}

function registryIntegratorPrompt(
  projectDir: string,
  vendors: string[],
  moduleRoot?: string,
): string {
  return [
    'You are the Layerkit registry integrator (single writer).',
    'Skill: layerkit-generate-java',
    `Project dir: ${projectDir}`,
    moduleRoot ? `Module: ${moduleRoot}` : '',
    vendors.length ? `Register vendors: ${vendors.join(', ')}` : 'Register all new adapters from INTEGRATE.md',
    'After per-vendor adapters exist, patch Registry + Router only.',
    'Preserve existing facade entry API. One PR-worthy diff. No duplicate facades.',
  ].join('\n');
}

function verifierPrompt(vendor: string, projectDir: string): string {
  return [
    `You are the Layerkit verifier for vendor: ${vendor}`,
    'Skill: layerkit-fix-from-dry-run',
    `Project dir: ${projectDir}`,
    'Run layerkit process dry-run --vendor <v> --intent <primary>.',
    'On failure: fix from docs evidence only (loop ≤3), never invent patches.',
    'Report green intents or residual human questions.',
  ].join('\n');
}

function qualityVerifierPrompt(projectDir: string, moduleRoot?: string): string {
  return [
    'You are the Layerkit quality verifier.',
    `Project dir: ${projectDir}`,
    moduleRoot ? `Run tests under module: ${moduleRoot}` : 'Run tests under generate.moduleRoot',
    'layerkit doctor --quality --strict',
    'JaCoCo ≥ 0.95 when Java module present. Report paths searched.',
  ].join('\n');
}

function checkerPrompt(projectDir: string, vendors: string[]): string {
  return [
    'You are the Layerkit checker assistant (READ-ONLY).',
    'Skill: layerkit-checker-assist',
    `Project dir: ${projectDir}`,
    vendors.length ? `Vendors: ${vendors.join(', ')}` : '',
    'Produce risk checklist only. NEVER approve, apply, or write checks[].',
    'Human must approve proposals and run promote.',
  ].join('\n');
}

export function isMultiAgentPlanPath(projectDir: string): boolean {
  return existsSync(join(projectDir, MULTI_AGENT_PLAN_JSON_REL));
}
