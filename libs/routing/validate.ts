/**
 * Structural validation for RoutingPolicy (before apply / runtime).
 */
import type { RoutingPolicy } from './types.js';

export interface RoutingValidationIssue {
  level: 'error' | 'warn';
  code: string;
  message: string;
  path?: string;
}

export function validateRoutingPolicy(policy: RoutingPolicy): RoutingValidationIssue[] {
  const issues: RoutingValidationIssue[] = [];

  if (policy.schemaVersion !== 1) {
    issues.push({
      level: 'error',
      code: 'schema',
      message: 'routing policy schemaVersion must be 1',
    });
  }
  if (!policy.id?.trim()) {
    issues.push({ level: 'error', code: 'id', message: 'routing policy id is required' });
  }
  if (!policy.version?.trim()) {
    issues.push({ level: 'error', code: 'version', message: 'routing policy version is required' });
  }

  const setIds = new Set<string>();
  if (!policy.vendorSets?.length) {
    issues.push({
      level: 'error',
      code: 'vendor_sets',
      message: 'at least one vendorSet is required',
    });
  }
  for (let i = 0; i < (policy.vendorSets?.length ?? 0); i++) {
    const s = policy.vendorSets[i]!;
    if (!s.id?.trim()) {
      issues.push({
        level: 'error',
        code: 'vendor_set_id',
        message: 'vendorSet.id required',
        path: `vendorSets[${i}]`,
      });
      continue;
    }
    if (setIds.has(s.id)) {
      issues.push({
        level: 'error',
        code: 'vendor_set_dup',
        message: `duplicate vendorSet id: ${s.id}`,
        path: `vendorSets[${i}]`,
      });
    }
    setIds.add(s.id);
    if (!s.vendors?.length) {
      issues.push({
        level: 'warn',
        code: 'vendor_set_empty',
        message: `vendorSet ${s.id} has no vendors`,
        path: `vendorSets[${i}].vendors`,
      });
    }
  }

  if (policy.defaultVendorSet && !setIds.has(policy.defaultVendorSet)) {
    issues.push({
      level: 'error',
      code: 'default_set_missing',
      message: `defaultVendorSet "${policy.defaultVendorSet}" not in vendorSets`,
    });
  }

  for (let i = 0; i < (policy.expansions?.length ?? 0); i++) {
    const e = policy.expansions![i]!;
    if (!e.id?.trim()) {
      issues.push({
        level: 'error',
        code: 'expansion_id',
        message: 'expansion.id required',
        path: `expansions[${i}]`,
      });
    }
    if (!e.emit?.length) {
      issues.push({
        level: 'error',
        code: 'expansion_emit',
        message: 'expansion.emit must be non-empty',
        path: `expansions[${i}].emit`,
      });
    }
    for (const em of e.emit ?? []) {
      if (!em.intent?.trim()) {
        issues.push({
          level: 'error',
          code: 'expansion_intent',
          message: 'expansion emit intent required',
          path: `expansions[${i}].emit`,
        });
      }
    }
  }

  if (!policy.routes?.length) {
    issues.push({
      level: 'warn',
      code: 'routes_empty',
      message: 'no routes defined — only defaultVendorSet (if any) will apply',
    });
  }
  for (let i = 0; i < (policy.routes?.length ?? 0); i++) {
    const r = policy.routes[i]!;
    if (!r.id?.trim()) {
      issues.push({
        level: 'error',
        code: 'route_id',
        message: 'route.id required',
        path: `routes[${i}]`,
      });
    }
    if (!r.to?.trim()) {
      issues.push({
        level: 'error',
        code: 'route_to',
        message: 'route.to (vendor set id) required',
        path: `routes[${i}].to`,
      });
    } else if (!setIds.has(r.to)) {
      issues.push({
        level: 'error',
        code: 'route_set_missing',
        message: `route ${r.id ?? i} to unknown vendorSet "${r.to}"`,
        path: `routes[${i}].to`,
      });
    }
  }

  const maxDepth = policy.maxExpansionDepth ?? 3;
  if (maxDepth < 1 || maxDepth > 16) {
    issues.push({
      level: 'error',
      code: 'max_expansion_depth',
      message: 'maxExpansionDepth must be between 1 and 16',
    });
  }

  return issues;
}

export function assertValidRoutingPolicy(policy: RoutingPolicy): void {
  const issues = validateRoutingPolicy(policy);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length) {
    throw new Error(
      `Invalid routing policy:\n${errors.map((e) => `- ${e.code}: ${e.message}`).join('\n')}`,
    );
  }
}
