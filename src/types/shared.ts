import type { StandardSchemaV1 } from "../standard-schema.js";
import type { InferPrevStateArg } from "./actions.js";
import type { CrafterConfig, CrafterErrors, CrafterSchemas } from "./config.js";
import type { InferData } from "./inference.js";
import type {
  InferValidatedInput,
  InferValidatedBindArgs,
  InferRawInput,
  InferRawBindArgs,
} from "./schemas.js";

// ============================================================================
// TYPE UTILITIES
// ============================================================================

/**
 * Expands type aliases for better IDE display.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Standard success/error result format for actions.
 */
export type ApiResult<TData, TError> =
  | { success: true; data: TData }
  | { success: false; error: TError };

/**
 * Result format for actions using useActionState.
 * Includes form values for success and error states.
 */
export type StatefulApiResult<
  TData,
  TError,
  TSuccessValues = unknown,
  TErrorValues = TSuccessValues,
> =
  | { success: true; data: TData; values?: TSuccessValues }
  | { success: false; error: TError; values?: TErrorValues };

// ============================================================================
// SCHEMA MAPPING UTILITIES
// ============================================================================

/**
 * Maps schema array to tuple of raw input types.
 */
export type MapSchemasToRawInput<T> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends StandardSchemaV1
    ? [StandardSchemaV1.InferInput<Head>, ...MapSchemasToRawInput<Tail>]
    : []
  : [];

/**
 * Maps schema array to tuple of validated output types.
 */
export type MapSchemasToValidatedOutput<T> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends StandardSchemaV1
    ? [StandardSchemaV1.InferOutput<Head>, ...MapSchemasToValidatedOutput<Tail>]
    : []
  : [];

// ============================================================================
// METADATA TYPES
// ============================================================================

/**
 * Base metadata available in action implementations and callbacks.
 */
export type BaseMetadata<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = {
  /** Original input before validation */
  rawInput?: InferRawInput<TSchemas>;
  /** Original bind arguments before validation */
  rawBindArgs?: InferRawBindArgs<TSchemas>;
  /** Previous result when using useActionState */
  prevState?: InferPrevStateArg<TConfig, TSchemas, TErrors, TData>;
};

/**
 * Metadata passed to action implementation functions.
 */
export type ActionImplMetadata<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = BaseMetadata<TConfig, TSchemas, TErrors, TData>;

/**
 * Enhanced metadata passed to lifecycle callbacks.
 */
export type CallbackMetadata<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = BaseMetadata<TConfig, TSchemas, TErrors, TData> & {
  /** Input data after validation */
  validatedInput?: InferValidatedInput<TSchemas>;
  /** Bind arguments after validation */
  validatedBindArgs?: InferValidatedBindArgs<TSchemas>;
};

// ============================================================================
// TYPE TRANSFORMATIONS
// ============================================================================

/**
 * Converts Result-based action to Exception-based action.
 * Used by the throwable() utility function.
 */
export type ThrowableAction<TAction> = TAction extends (
  ...args: infer TArgs
) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  ? (...args: TArgs) => Promise<InferData<TAction>>
  : never;
