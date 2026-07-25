/**
 * Strategy layer: processor registry, builtins, pure execute.
 */
export {
  executeBuiltin,
  opEmailNormalizeBasic,
  opHashSha256Hex,
  opLowercase,
  opPhoneDigitsOnly,
  opStringTrimLower,
  opTrim,
} from './builtins.js';
export { executeImpl, executeProcessor, type ExecuteOptions } from './execute.js';
export {
  createStrategyRegistry,
  StrategyRegistry,
  type ResolvedProcessor,
} from './registry.js';
export {
  BUILTIN_OPS,
  builtinProcessorId,
  isBuiltinOp,
  ProcessorUnresolvedError,
  type BuiltinOp,
  type ExecutableProcessor,
  type ProcessorImpl,
} from './types.js';
