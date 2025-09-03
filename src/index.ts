// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================

// Core Functions
export { craft } from "./classes/craft-builder.js";
export { action } from "./classes/action-builder.js";
export { unwrap, throwable, initial, getActionId } from "./utils.js";
export { ActioncraftError, isActioncraftError } from "./classes/error.js";

// Result API (for functional format)
export type { Result, Ok, Err } from "./types/result.js";
export { isOk, isErr, ok, err } from "./types/result.js";

// Type Inference Utilities
export type {
  InferInput,
  InferResult,
  InferData,
  InferErrors,
} from "./types/inference.js";
