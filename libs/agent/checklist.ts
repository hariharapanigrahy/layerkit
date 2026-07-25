/**
 * Normative agent skill pipeline for vendor integration work.
 * Shared by orchestrate checklist fixture, evals, and (optional) skill docs.
 *
 * Order is evidence-first process quality, not vendor catalog coverage:
 * bootstrap → discover → research → processors → flow → privacy → generate → check
 */
export const REQUIRED_SKILL_PIPELINE = [
  'layerkit-bootstrap',
  'layerkit-discover-data-layer',
  'layerkit-research-vendor',
  'layerkit-author-processor',
  'layerkit-design-flow',
  'layerkit-privacy-review',
  'layerkit-generate-java',
  'layerkit-checker-assist',
] as const;

export type RequiredSkillId = (typeof REQUIRED_SKILL_PIPELINE)[number];

export interface OrchestrateChecklist {
  /** Stable id for the checklist fixture */
  id: string;
  /** Human title */
  title: string;
  /** Ordered skill ids agents must follow */
  skills: string[];
  /** Optional notes for residual / parallel steps */
  notes?: string[];
}

/**
 * Assert a checklist object lists every required skill in the correct relative order.
 * Extra skills are allowed; required ones must appear in pipeline order.
 */
export function assertChecklistCompleteness(checklist: OrchestrateChecklist): {
  ok: boolean;
  missing: string[];
  orderErrors: string[];
} {
  const skills = checklist.skills ?? [];
  const missing = REQUIRED_SKILL_PIPELINE.filter((s) => !skills.includes(s));
  const orderErrors: string[] = [];

  let lastIdx = -1;
  for (const req of REQUIRED_SKILL_PIPELINE) {
    const idx = skills.indexOf(req);
    if (idx === -1) continue;
    if (idx < lastIdx) {
      orderErrors.push(
        `${req} appears at index ${idx} but a later pipeline skill already appeared at ${lastIdx}`,
      );
    }
    lastIdx = idx;
  }

  // Pairwise: each consecutive required pair must keep order when both present
  for (let i = 0; i < REQUIRED_SKILL_PIPELINE.length - 1; i++) {
    const a = REQUIRED_SKILL_PIPELINE[i]!;
    const b = REQUIRED_SKILL_PIPELINE[i + 1]!;
    const ia = skills.indexOf(a);
    const ib = skills.indexOf(b);
    if (ia >= 0 && ib >= 0 && ia > ib) {
      orderErrors.push(`${a} must precede ${b} (got ${ia} > ${ib})`);
    }
  }

  return {
    ok: missing.length === 0 && orderErrors.length === 0,
    missing: [...missing],
    orderErrors,
  };
}
