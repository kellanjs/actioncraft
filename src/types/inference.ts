import type { CraftedAction, CraftedActionInfer } from "./actions.js";

// ============================================================================
// PUBLIC TYPE INFERENCE UTILITIES
// ============================================================================

/**
 * Extracts the raw input type from a crafted action.
 *
 * @example
 * ```typescript
 * // Traditional approach
 * type MyInput = InferInput<typeof myAction>
 *
 * // Alternative using $Infer (recommended)
 * type MyInput = typeof myAction.$Infer.Input
 * ```
 */
export type InferInput<T> =
  T extends CraftedAction<
    infer TConfig,
    infer TSchemas,
    infer TErrors,
    infer TData
  >
    ? CraftedActionInfer<TConfig, TSchemas, TErrors, TData>["Input"]
    : never;

/**
 * Extracts the complete result type from a crafted action.
 *
 * @example
 * ```typescript
 * // Traditional approach
 * type MyResult = InferResult<typeof myAction>
 *
 * // Alternative using $Infer (recommended)
 * type MyResult = typeof myAction.$Infer.Result
 * ```
 */
export type InferResult<T> =
  T extends CraftedAction<
    infer TConfig,
    infer TSchemas,
    infer TErrors,
    infer TData
  >
    ? CraftedActionInfer<TConfig, TSchemas, TErrors, TData>["Result"]
    : never;

/**
 * Extracts the success data type from a crafted action.
 *
 * @example
 * ```typescript
 * // Traditional approach
 * type MyData = InferData<typeof myAction>
 *
 * // Alternative using $Infer (recommended)
 * type MyData = typeof myAction.$Infer.Data
 * ```
 */
export type InferData<T> =
  T extends CraftedAction<
    infer TConfig,
    infer TSchemas,
    infer TErrors,
    infer TData
  >
    ? CraftedActionInfer<TConfig, TSchemas, TErrors, TData>["Data"]
    : never;

/**
 * Extracts possible error types from a crafted action.
 *
 * @example
 * ```typescript
 * // Traditional approach
 * type MyErrors = InferErrors<typeof myAction>
 *
 * // Alternative using $Infer (recommended)
 * type MyErrors = typeof myAction.$Infer.Errors
 * ```
 */
export type InferErrors<T> =
  T extends CraftedAction<
    infer TConfig,
    infer TSchemas,
    infer TErrors,
    infer TData
  >
    ? CraftedActionInfer<TConfig, TSchemas, TErrors, TData>["Errors"]
    : never;
