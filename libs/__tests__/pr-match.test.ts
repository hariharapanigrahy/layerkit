import { describe, expect, it } from 'vitest';
import { parseGithubOwnerRepo } from '../agent/open-client-pr.js';
import {
  matchTokens,
  pickBestPrMatch,
  scorePrMatch,
  type PrMatchCandidate,
} from '../agent/pr-match.js';

function cand(partial: Partial<PrMatchCandidate> & Pick<PrMatchCandidate, 'number' | 'headRefName'>): PrMatchCandidate {
  return {
    url: `https://github.com/acme/pkg/pull/${partial.number}`,
    title: partial.title ?? '',
    body: partial.body ?? '',
    headRepositoryOwner: 'me',
    ...partial,
  };
}

describe('matchTokens', () => {
  it('splits on non-alphanumeric and drops short tokens', () => {
    expect(matchTokens('heal multilang surfaces')).toEqual(['heal', 'multilang', 'surfaces']);
    expect(matchTokens('a bb ccc dddd')).toEqual(['dddd']);
    expect(matchTokens('')).toEqual([]);
  });
});

describe('scorePrMatch / pickBestPrMatch', () => {
  it('rejects heads without layerkit/', () => {
    const tokens = matchTokens('heal multilang');
    expect(
      scorePrMatch(
        { number: 1, title: 'heal multilang', body: '', headRefName: 'feature/other' },
        'heal multilang',
        tokens,
      ),
    ).toBe(-1);
  });

  it('rejects when tokens do not cover title/body/head', () => {
    const tokens = matchTokens('heal multilang surfaces');
    expect(
      scorePrMatch(
        {
          number: 2,
          title: 'unrelated',
          body: '',
          headRefName: 'layerkit/other',
        },
        'heal multilang surfaces',
        tokens,
      ),
    ).toBe(-1);
  });

  it('prefers head that contains match key over body-only match', () => {
    const key = 'heal multilang surfaces';
    const tokens = matchTokens(key);
    const headHit = cand({
      number: 10,
      title: 'something',
      body: 'heal multilang surfaces work',
      headRefName: 'layerkit/heal-multilang-surfaces',
    });
    const bodyOnly = cand({
      number: 99,
      title: 'heal multilang surfaces',
      body: 'heal multilang surfaces',
      headRefName: 'layerkit/other-branch',
    });
    expect(scorePrMatch(headHit, key, tokens)).toBeGreaterThan(scorePrMatch(bodyOnly, key, tokens));
    expect(pickBestPrMatch([bodyOnly, headHit], key, { explicitMatch: true })?.number).toBe(10);
  });

  it('title-derived match requires at least two tokens', () => {
    const only = cand({
      number: 3,
      title: 'heal something',
      body: '',
      headRefName: 'layerkit/heal-something',
    });
    expect(pickBestPrMatch([only], 'heal', { explicitMatch: false })).toBeNull();
    expect(pickBestPrMatch([only], 'heal something', { explicitMatch: false })?.number).toBe(3);
  });

  it('explicit single-token match is allowed', () => {
    const only = cand({
      number: 4,
      title: 'workstream',
      body: 'layerkit workstream',
      headRefName: 'layerkit/workstream-a',
    });
    // "workstream" is length >= 4
    expect(pickBestPrMatch([only], 'workstream', { explicitMatch: true })?.number).toBe(4);
  });

  it('on equal score prefers higher PR number (raw, not mod 1000)', () => {
    const key = 'heal multilang surfaces';
    const older = cand({
      number: 12,
      title: 'heal multilang surfaces',
      body: '',
      headRefName: 'layerkit/heal-a',
    });
    const newer = cand({
      number: 1500,
      title: 'heal multilang surfaces',
      body: '',
      headRefName: 'layerkit/heal-b',
    });
    // Same token coverage on title; score equal → raw PR number decides
    expect(scorePrMatch(older, key, matchTokens(key))).toBe(scorePrMatch(newer, key, matchTokens(key)));
    expect(pickBestPrMatch([older, newer], key, { explicitMatch: true })?.number).toBe(1500);
  });
});

describe('parseGithubOwnerRepo', () => {
  it('parses https and ssh remotes', () => {
    expect(parseGithubOwnerRepo('https://github.com/acme/customer-package.git')).toEqual({
      owner: 'acme',
      repo: 'customer-package',
    });
    expect(parseGithubOwnerRepo('git@github.com:acme/customer-package.git')).toEqual({
      owner: 'acme',
      repo: 'customer-package',
    });
    expect(parseGithubOwnerRepo('https://gitlab.com/acme/pkg.git')).toBeNull();
  });
});
