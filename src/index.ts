// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================

// Core Functions
export { create, initial } from "./actioncraft.js";
export { unwrap, throwable } from "./utils.js";
export { ActionCraftError, isActionCraftError } from "./error.js";

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
