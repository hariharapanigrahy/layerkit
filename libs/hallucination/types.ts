/**
 * Hallucination / invent-signal detection types.
 * Fail-closed before store mutation: agents must not invent vendor truth.
 */

export type HallucinationLevel = 'error' | 'warn';

/** Stable issue codes for reports, gates, and apply block messages. */
export type HallucinationIssueCode =
  | 'empty_sources'
  | 'placeholder_source_url'
  | 'placeholder_endpoint_path'
  | 'placeholder_base_url'
  | 'invent_field_path'
  | 'empty_documentation'
  | 'processor_sources'
  | 'host_source_mismatch'
  | 'example_host';

export interface HallucinationIssue {
  level: HallucinationLevel;
  code: HallucinationIssueCode;
  message: string;
  path?: string;
}

/** Result of scanning a proposal (and VendorMap payload) for invent signals. */
export interface DetectionResult {
  issues: HallucinationIssue[];
}

/** Alias used by detectHallucination / assertNoHallucination. */
export type HallucinationReport = DetectionResult;

export interface AssertNoHallucinationOpts {
  /**
   * When true, warnings (e.g. example.com fixtures) also throw.
   * Default false: only level=error blocks.
   */
  strict?: boolean;
}

export const HALLUCINATION_ISSUE_CODES: readonly HallucinationIssueCode[] = [
  'empty_sources',
  'placeholder_source_url',
  'placeholder_endpoint_path',
  'placeholder_base_url',
  'invent_field_path',
  'empty_documentation',
  'processor_sources',
  'host_source_mismatch',
  'example_host',
] as const;
