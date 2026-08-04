/**
 * Pure PR-dedupe match helpers for open-client-pr.
 * Free-form token match only — not a vendor API registry.
 */

export interface PrMatchCandidate {
  number: number;
  url: string;
  title: string;
  body: string;
  headRefName: string;
  headRepositoryOwner?: string;
}

/** Tokenize a PR-match key (min length 4 to skip short noise). */
export function matchTokens(key: string): string[] {
  return key
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

/**
 * Score a PR candidate against a match key.
 * Returns -1 when not eligible (must include layerkit/ head + token coverage).
 *
 * Ranking (higher wins):
 * - head path contains full match key (or kebab form)
 * - head contains each token
 * - title/body/head blob contains every token
 * - blob contains raw match string
 * - higher PR number breaks ties (newer open PR)
 */
export function scorePrMatch(
  pr: Pick<PrMatchCandidate, 'title' | 'body' | 'headRefName' | 'number'>,
  prMatch: string,
  tokens: string[],
): number {
  const head = pr.headRefName.toLowerCase();
  if (!head.includes('layerkit')) return -1;

  const key = prMatch.toLowerCase().trim();
  if (!key) return -1;

  const blob = `${pr.title}\n${pr.body}\n${pr.headRefName}`.toLowerCase();
  const kebab = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const everyToken = tokens.length > 0 && tokens.every((t) => blob.includes(t));
  const rawInBlob = blob.includes(key);
  if (!everyToken && !rawInBlob) return -1;

  let score = 0;
  if (head.includes(kebab) || head.includes(key.replace(/\s+/g, '-'))) score += 100;
  for (const t of tokens) {
    if (head.includes(t)) score += 10;
    if (blob.includes(t)) score += 1;
  }
  if (everyToken) score += 50;
  if (rawInBlob) score += 20;
  return score;
}

/**
 * Pick the best matching PR from a list.
 * Highest score wins; on equal score, higher PR number (newer) wins.
 */
export function pickBestPrMatch(
  candidates: PrMatchCandidate[],
  prMatch: string,
  opts?: { explicitMatch?: boolean },
): PrMatchCandidate | null {
  const tokens = matchTokens(prMatch);
  const explicit = opts?.explicitMatch === true;
  // Title-derived match needs ≥2 tokens so short titles do not over-reuse
  if (!explicit && tokens.length < 2) return null;

  let best: PrMatchCandidate | null = null;
  let bestScore = -1;
  for (const pr of candidates) {
    const score = scorePrMatch(pr, prMatch, tokens);
    if (score < 0) continue;
    if (
      best === null ||
      score > bestScore ||
      (score === bestScore && pr.number > best.number)
    ) {
      bestScore = score;
      best = pr;
    }
  }
  return best;
}
