/** Production integrate plans (topology + INTEGRATE.md). */
export {
  checkJavaQuality,
  defaultJacocoSearchRoots,
  findJacocoReport,
  hasJavaProjectSignal,
  JACOCO_MIN_LINE_COVERAGE,
  parseJacocoCsvLineRate,
  parseJacocoXmlLineRate,
} from './quality.js';
export type {
  JacocoReportSummary,
  QualityCheckOptions,
  QualityCheckResult,
} from './quality.js';
export {
  scanIntegrationTopology,
  topologySuggestsIntegrate,
  isTopologyScannableRoot,
} from './scan-topology.js';
export type { ScanTopologyOptions } from './scan-topology.js';
export {
  applyIntegratePlan,
  buildIntegratePlan,
  formatIntegratePlanMarkdown,
  loadIntegratePlan,
  resolveGenerateMode,
  writeIntegratePlanArtifacts,
} from './integrate-plan.js';
export type {
  ApplyIntegratePlanOptions,
  ApplyIntegratePlanResult,
  BuildIntegratePlanOptions,
} from './integrate-plan.js';
export type {
  IntegrationLanguage,
  IntegrationPlan,
  IntegrationTopology,
  PlanAction,
  PlanActionKind,
  ResolveGenerateModeResult,
  TopologyFile,
  TopologyRole,
} from './types.js';
