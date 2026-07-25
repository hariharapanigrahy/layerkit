/**
 * Progressive deepen planner — expand hub markdown links before asking humans.
 * Deterministic, no network; operates on provided content / refs only.
 */
import type { DeepenLogEntry, DeepenPlan, ResearchSeed } from './types.js';

const OPENAPI_NAME_RE = /openapi\.(json|ya?ml)|swagger\.(json|ya?ml)/i;
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const BARE_SPEC_RE = /(?:^|\s)((?:\.\/|\/)?[\w./-]*(?:openapi|swagger)\.(?:json|ya?ml))/gi;

/**
 * From hub markdown (or seeds containing hub_md / text), plan next evidence
 * fetches. Enqueues OpenAPI paths **before** marking needsHuman.
 */
export function planDeepen(seeds: ResearchSeed[], opts?: { maxDepth?: number }): DeepenPlan {
  void opts;
  const enqueue: DeepenPlan['enqueue'] = [];
  const seen = new Set<string>();
  const deepenLog: DeepenLogEntry[] = [];

  const push = (kind: DeepenPlan['enqueue'][0]['kind'], ref: string, level: number, action: string) => {
    const key = `${kind}:${ref}`;
    if (seen.has(key)) return;
    seen.add(key);
    enqueue.push({ kind, ref });
    deepenLog.push({ level, action, detail: ref, enqueued: [ref] });
  };

  // L0: seeds already provided
  deepenLog.push({
    level: 0,
    action: 'use_provided_seeds',
    detail: `count=${seeds.length}`,
  });

  for (const seed of seeds) {
    if (seed.kind === 'openapi') {
      push('openapi', seed.urlOrPath, 0, 'seed_openapi');
    }
    if (seed.kind === 'curl') {
      push('curl', 'inline-curl', 0, 'seed_curl');
    }
    if (seed.kind === 'hub_md' || seed.kind === 'text' || seed.kind === 'file') {
      const body =
        seed.kind === 'hub_md'
          ? seed.content
          : seed.kind === 'text'
            ? seed.body
            : (seed.content ?? '');
      const origin = seed.kind === 'hub_md' ? seed.path : seed.kind === 'file' ? seed.path : seed.title;

      // L1: recursive expand links from hub content
      const links = extractMarkdownLinks(body);
      deepenLog.push({
        level: 1,
        action: 'expand_hub_links',
        detail: origin,
        enqueued: links.map((l) => l.href),
      });

      // Prefer openapi/swagger refs first (stable order: openapi before other docs)
      const openapiLinks = links.filter((l) => isOpenApiRef(l.href));
      const otherDocLinks = links.filter((l) => !isOpenApiRef(l.href) && isDocRef(l.href));

      for (const l of openapiLinks) {
        push('openapi', l.href, 1, 'hub_link_openapi');
      }
      for (const bare of extractBareSpecRefs(body)) {
        push('openapi', bare, 1, 'hub_bare_openapi');
      }
      for (const l of otherDocLinks) {
        push('doc', l.href, 1, 'hub_link_doc');
      }
    }
  }

  // needsHuman only when nothing left to enqueue from hub evidence ladder L0–L1
  const hasOpenapiQueued = enqueue.some((e) => e.kind === 'openapi');
  const needsHuman = enqueue.length === 0;

  if (hasOpenapiQueued) {
    deepenLog.push({
      level: 1,
      action: 'prefer_openapi_before_human',
      detail: 'OpenAPI path enqueued; do not ask human for Q1/Q2 yet',
    });
  } else if (needsHuman) {
    deepenLog.push({
      level: 5,
      action: 'needs_human_residual',
      detail: 'No further machine evidence derived from seeds',
    });
  }

  // Stable: openapi first, then doc, curl, other
  const order = { openapi: 0, doc: 1, curl: 2, other: 3 } as const;
  enqueue.sort((a, b) => order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref));

  return { enqueue, deepenLog, needsHuman };
}

/**
 * Convenience: deepen from a single hub markdown string.
 */
export function deepenFromHubMarkdown(content: string, path = 'hub-index.md'): DeepenPlan {
  return planDeepen([{ kind: 'hub_md', path, content }]);
}

function extractMarkdownLinks(md: string): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = [];
  MD_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_RE.exec(md)) !== null) {
    const href = (m[2] ?? '').trim();
    if (!href || href.startsWith('#')) continue;
    out.push({ text: m[1] ?? '', href });
  }
  return out;
}

function extractBareSpecRefs(md: string): string[] {
  const out: string[] = [];
  BARE_SPEC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_SPEC_RE.exec(md)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function isOpenApiRef(href: string): boolean {
  return OPENAPI_NAME_RE.test(href) || /\/openapi(\.json)?$/i.test(href) || /\/swagger/i.test(href);
}

function isDocRef(href: string): boolean {
  return /\.(md|mdx|html?)($|\?)/i.test(href) || href.startsWith('./') || href.startsWith('../');
}
