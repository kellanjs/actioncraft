import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Config, Schemas, Errors } from "./builder.js";
import type { Result } from "./result.js";
import type { Prettify } from "./shared.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Map of error identifiers that should never be surfaced to clients.
 */
export const INTERNAL_ERROR_TYPES = {
  IMPLICIT_RETURN: "IMPLICIT_RETURN",
  INTERNAL_LOGIC: "INTERNAL_LOGIC",
  OUTPUT_VALIDATION: "OUTPUT_VALIDATION",
} as const;

/**
 * Literal union of the keys of `INTERNAL_ERROR_TYPES`
 */
export type InternalErrorType =
  (typeof INTERNAL_ERROR_TYPES)[keyof typeof INTERNAL_ERROR_TYPES];

/**
 * Map of error identifiers that can be surfaced to clients.
 */
export const EXTERNAL_ERROR_TYPES = {
  INITIAL_STATE: "INITIAL_STATE",
  UNHANDLED: "UNHANDLED",
  INPUT_VALIDATION: "INPUT_VALIDATION",
  BIND_ARGS_VALIDATION: "BIND_ARGS_VALIDATION",
} as const;

/**
 * Literal union of the keys of `EXTERNAL_ERROR_TYPES`
 */
export type ExternalErrorType =
  (typeof EXTERNAL_ERROR_TYPES)[keyof typeof EXTERNAL_ERROR_TYPES];

// ============================================================================
// ERROR DEFINITION TYPES
// ============================================================================

/**
 * Base structure for all Actioncraft error objects.
 */
export type BaseError = {
  type: string;
  message?: string;
};

/**
 * Type constraint for custom error objects defined by users.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UserDefinedError = BaseError & Record<string, any>;

/**
 * Function signature for custom error definitions in .errors() method.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErrorDefinition = (...args: any[]) => UserDefinedError;

/**
 * Transforms error definition functions into Result-returning functions.
 */
export type ErrorDefToResult<T> = T extends (...args: infer P) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  ? (...args: P) => Result<never, ReturnType<T>>
  : never;

// ============================================================================
// INTERNAL ERROR TYPES
// ============================================================================

/**
 * Error when action handler returns undefined.
 */
export type ImplicitReturnError = BaseError & {
  type: typeof INTERNAL_ERROR_TYPES.IMPLICIT_RETURN;
  message: "Action handler must return a value";
};

/**
 * Error indicating a bug in the Actioncraft library.
 */
export type InternalLogicError = BaseError & {
  type: typeof INTERNAL_ERROR_TYPES.INTERNAL_LOGIC;
  message: string;
};

// ============================================================================
// EXTERNAL ERROR TYPES
// ============================================================================

/**
 * Marker for initial state in useActionState before any action executes.
 */
export type InitialStateMarker = BaseError & {
  type: typeof EXTERNAL_ERROR_TYPES.INITIAL_STATE;
  message: "Action has not been executed yet";
};

/**
 * Error for uncaught exceptions when no custom handler is provided.
 */
export type UnhandledError = BaseError & {
  type: typeof EXTERNAL_ERROR_TYPES.UNHANDLED;
  message: "An unhandled error occurred";
};

// ============================================================================
// VALIDATION ERROR TYPES
// ============================================================================

/**
 * Error when no input schema is defined for an action.
 * Used by `$validate` for client-side data validation.
 */
export type NoInputSchemaError = BaseError & {
  type: "NO_INPUT_SCHEMA";
  message: "Cannot validate input: no input schema defined for this action";
};

/**
 * Base structure for validation errors with nested field organization.
 */
type NestedValidationError<TType extends string> = BaseError & {
  type: TType;
  message: string;
  formErrors: string[];
  fieldErrors: { [path: string]: string[] };
};

/**
 * Base structure for validation errors with flat issue array.
 */
type FlattenedValidationError<TType extends string> = BaseError & {
  type: TType;
  message: string;
  issues: { path: (string | number)[]; message: string }[];
};

/**
 * Input validation error with nested field structure.
 */
export type NestedInputValidationError = NestedValidationError<
  typeof EXTERNAL_ERROR_TYPES.INPUT_VALIDATION
>;

/**
 * Input validation error with flat issue array.
 */
export type FlattenedInputValidationError = FlattenedValidationError<
  typeof EXTERNAL_ERROR_TYPES.INPUT_VALIDATION
>;

/**
 * Output validation error with nested field structure.
 */
export type NestedOutputValidationError = NestedValidationError<
  typeof INTERNAL_ERROR_TYPES.OUTPUT_VALIDATION
>;

/**
 * Output validation error with flat issue array.
 */
export type FlattenedOutputValidationError = FlattenedValidationError<
  typeof INTERNAL_ERROR_TYPES.OUTPUT_VALIDATION
>;

/**
 * Bind arguments validation error with nested field structure.
 */
export type NestedBindArgsValidationError = NestedValidationError<
  typeof EXTERNAL_ERROR_TYPES.BIND_ARGS_VALIDATION
>;

/**
 * Bind arguments validation error with flat issue array.
 */
export type FlattenedBindArgsValidationError = FlattenedValidationError<
  typeof EXTERNAL_ERROR_TYPES.BIND_ARGS_VALIDATION
>;

// ============================================================================
// VALIDATION ERROR UNIONS
// ============================================================================

/**
 * All possible input validation error formats.
 */
export type InputValidationError =
  | NestedInputValidationError
  | FlattenedInputValidationError;

/**
 * All possible output validation error formats.
 */
export type OutputValidationError =
  | NestedOutputValidationError
  | FlattenedOutputValidationError;

/**
 * All possible bind arguments validation error formats.
 */
export type BindArgsValidationError =
  | NestedBindArgsValidationError
  | FlattenedBindArgsValidationError;

/**
 * All validation error types combined.
 */
export type ValidationError =
  | InputValidationError
  | OutputValidationError
  | BindArgsValidationError;

/**
 * Base structure for validation errors before type-specific fields.
 */
export type ValidationErrorFormat =
  | { formErrors: string[]; fieldErrors: Record<string, string[]> }
  | { issues: { path: (string | number)[]; message: string }[] };

// ============================================================================
// ERROR TYPE INFERENCE
// ============================================================================

/**
 * Error functions object provided to action handlers.
 */
export type ErrorFunctions<TErrors extends Errors> = Prettify<{
  [K in keyof TErrors]: ErrorDefToResult<TErrors[K]>;
}>;

/**
 * Input validation error format based on configuration.
 */
export type InferInputValidationErrorFormat<TConfig extends Config> =
  TConfig["validationErrorFormat"] extends "nested"
    ? NestedInputValidationError
    : FlattenedInputValidationError;

/**
 * Output validation error format based on configuration.
 */
export type InferOutputValidationErrorFormat<TConfig extends Config> =
  TConfig["validationErrorFormat"] extends "nested"
    ? NestedOutputValidationError
    : FlattenedOutputValidationError;

/**
 * Bind arguments validation error format based on configuration.
 */
export type InferBindArgsValidationErrorFormat<TConfig extends Config> =
  TConfig["validationErrorFormat"] extends "nested"
    ? NestedBindArgsValidationError
    : FlattenedBindArgsValidationError;

/**
 * All error types from user-defined error functions.
 */
export type InferUserDefinedErrorTypes<TErrors extends Errors> = {
  [K in keyof TErrors]: ReturnType<TErrors[K]>;
}[keyof TErrors];

/**
 * Error type for thrown exceptions based on custom handler configuration.
 */
export type InferThrownErrorType<TConfig extends Config> = TConfig extends {
  handleThrownError: (error: unknown) => infer R;
}
  ? R
  : UnhandledError;

// ============================================================================
// CLIENT-FACING ERRORS
// ============================================================================

/**
 * Input validation error type when input schema is present.
 */
type InferInputValidationErrorType<
  TConfig extends Config,
  TSchemas extends Schemas,
> = TSchemas extends { inputSchema: StandardSchemaV1 }
  ? InferInputValidationErrorFormat<TConfig>
  : never;

/**
 * Bind arguments validation error type when bind schemas are present.
 */
type InferBindArgsValidationErrorType<
  TConfig extends Config,
  TSchemas extends Schemas,
> = TSchemas extends { bindSchemas: readonly StandardSchemaV1[] }
  ? InferBindArgsValidationErrorFormat<TConfig>
  : never;

/**
 * Possible errors that clients should expect when calling an action.
 */
export type PossibleErrors<
  TErrors extends Errors,
  TConfig extends Config,
  TSchemas extends Schemas,
> =
  | InitialStateMarker
  | InferThrownErrorType<TConfig>
  | InferInputValidationErrorType<TConfig, TSchemas>
  | InferBindArgsValidationErrorType<TConfig, TSchemas>
  | InferUserDefinedErrorTypes<TErrors>;

// ============================================================================
// INTERNAL ERRORS
// ============================================================================

/**
 * Output validation error type when output schema is present.
 */
type InferOutputValidationErrorType<
  TConfig extends Config,
  TSchemas extends Schemas,
> = TSchemas extends { outputSchema: StandardSchemaV1 }
  ? InferOutputValidationErrorFormat<TConfig>
  : never;

/**
 * All possible errors, both internal and external.
 */
export type AllPossibleErrors<
  TErrors extends Errors,
  TConfig extends Config,
  TSchemas extends Schemas,
> =
  | PossibleErrors<TErrors, TConfig, TSchemas>
  | ImplicitReturnError
  | InternalLogicError
  | InferOutputValidationErrorType<TConfig, TSchemas>;
