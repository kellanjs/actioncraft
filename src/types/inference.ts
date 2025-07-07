import type { CraftedAction, InferCraftedActionResult } from "./actions.js";
import type { PossibleErrors } from "./errors.js";
import type { InferRawInput } from "./schemas.js";

// ============================================================================
// PUBLIC TYPE INFERENCE UTILITIES
// ============================================================================

/**
 * Extracts the raw input type from a crafted action.
 */
export type InferInput<T> =
  T extends CraftedAction<
    infer _TConfig,
    infer TSchemas,
    any, // eslint-disable-line @typescript-eslint/no-explicit-any
    any // eslint-disable-line @typescript-eslint/no-explicit-any
  >
    ? InferRawInput<TSchemas>
    : never;

/**
 * Extracts the complete result type from a crafted action.
 */
export type InferResult<T> =
  T extends CraftedAction<
    infer TConfig,
    infer TSchemas,
    infer TErrors,
    infer TData
  >
    ? InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>
    : never;

/**
 * Extracts the success data type from a crafted action.
 */
export type InferData<T> =
  T extends CraftedAction<any, any, any, infer TData> // eslint-disable-line @typescript-eslint/no-explicit-any
    ? TData
    : never;

/**
 * Extracts possible error types from a crafted action.
 */
export type InferErrors<T> =
  T extends CraftedAction<
    infer TConfig,
    infer TSchemas,
    infer TErrors,
    any // eslint-disable-line @typescript-eslint/no-explicit-any
  >
    ? PossibleErrors<TErrors, TConfig, TSchemas>
    : never;
