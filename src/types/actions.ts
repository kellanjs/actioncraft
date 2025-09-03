import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Config, Schemas, Errors } from "./builder.js";
import type {
  ErrorFunctions,
  InferUserDefinedErrorTypes,
  PossibleErrors,
  InferInputValidationErrorFormat,
  NoInputSchemaError,
} from "./errors.js";
import type { Result, Ok, Err } from "./result.js";
import type {
  InferValidatedInput,
  InferRawBindArgs,
  InferValidatedBindArgs,
  InferRawInputTuple,
  InferRawInput,
} from "./schemas.js";
import type {
  ApiResult,
  HandlerMetadata,
  StatefulApiResult,
} from "./shared.js";

// ============================================================================
// HANDLER (server action logic)
// ============================================================================

/**
 * Extracts the success data type from a handler function.
 */
export type InferDataFromHandler<TFn> = TFn extends (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
any
  ? Awaited<ReturnType<TFn>> extends infer TReturn
    ? TReturn extends Ok<infer U>
      ? U
      : TReturn extends Err<unknown> | undefined
        ? never
        : TReturn
    : never
  : never;

/**
 * Parameters passed to handler functions.
 */
export type HandlerParams<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = {
  /** Validated input data after schema validation */
  input: InferValidatedInput<TSchemas>;
  /** Validated bind arguments after schema validation */
  bindArgs: InferValidatedBindArgs<TSchemas>;
  /** Helper functions for returning typed errors */
  errors: ErrorFunctions<TErrors>;
  /** Handler metadata for debugging and logging */
  metadata: HandlerMetadata<TConfig, TSchemas, TErrors, TData>;
};

/**
 * Handler function signature.
 * Can return ok(data), errors.yourError(), raw data, or null.
 * Returning undefined is treated as an error.
 */
export type Handler<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = (
  params: HandlerParams<TConfig, TSchemas, TErrors, TData>,
) => Promise<
  Result<TData, InferUserDefinedErrorTypes<TErrors>> | TData | undefined
>;

/**
 * Arguments that the handler accepts.
 * Differs based on useActionState configuration.
 */
export type InferHandlerArgs<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = TConfig extends { useActionState: true }
  ? StatefulActionArgs<TConfig, TSchemas, TErrors, TData>
  : StatelessActionArgs<TSchemas>;

// ============================================================================
// STATEFUL ACTION (for useActionState)
// ============================================================================

/**
 * Action compatible with React's useActionState hook.
 */
export type StatefulAction<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = (
  ...args: StatefulActionArgs<TConfig, TSchemas, TErrors, TData>
) => Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>>;

/**
 * Arguments for stateful actions: bind args, previous state, then input.
 */
export type StatefulActionArgs<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = [
  ...InferRawBindArgs<TSchemas>,
  InferPrevStateArg<TConfig, TSchemas, TErrors, TData>,
  ...InferRawInputTuple<TSchemas>,
];

/**
 * Previous state parameter for useActionState.
 */
export type InferPrevStateArg<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = TConfig extends {
  useActionState: true;
}
  ? StatefulApiResult<
      TData,
      PossibleErrors<TErrors, TConfig, TSchemas>,
      InferSerializedSuccessValues<TSchemas>,
      InferSerializedErrorValues<TSchemas>
    >
  : never;

// ============================================================================
// FORM VALUES (for useActionState)
// ============================================================================

/**
 * Extracts object-like types from a union, excluding primitives
 */
type _UnionObjectLike<T> = Extract<T, Record<string, unknown>>;

/**
 * Excludes iterable types like arrays and FormData
 */
type _ExcludeIterable<T> = T extends { [Symbol.iterator](): Iterator<unknown> }
  ? never
  : T;

/**
 * Gets plain objects only, excluding arrays and iterables
 */
type _PlainObjectLike<T> = _ExcludeIterable<_UnionObjectLike<T>>;

/**
 * Ensures never types fall back to empty object
 */
type _SafePlainObjectLike<T> = [_PlainObjectLike<T>] extends [never]
  ? Record<string, never>
  : _PlainObjectLike<T>;

/**
 * Checks if a type is exactly unknown
 */
type _IsExactlyUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false;

/**
 * Converts unknown fields to serialized form values.
 */
type _ValuesWithFallback<T> = {
  [K in keyof T]: _IsExactlyUnknown<T[K]> extends true
    ? string | string[] | undefined
    : T[K];
};

/**
 * Form values available when an action succeeds.
 */
export type InferSerializedSuccessValues<TSchemas extends Schemas> =
  TSchemas extends { inputSchema: StandardSchemaV1 }
    ? StandardSchemaV1.InferOutput<TSchemas["inputSchema"]> extends Record<
        string,
        unknown
      >
      ? Record<string, string | string[]> &
          _ValuesWithFallback<
            _SafePlainObjectLike<
              StandardSchemaV1.InferOutput<TSchemas["inputSchema"]>
            >
          >
      : StandardSchemaV1.InferOutput<TSchemas["inputSchema"]>
    : unknown;

/**
 * Form values available when an action fails.
 */
export type InferSerializedErrorValues<TSchemas extends Schemas> =
  TSchemas extends {
    inputSchema: StandardSchemaV1;
  }
    ? Record<string, string | string[]> &
        _ValuesWithFallback<
          _SafePlainObjectLike<
            StandardSchemaV1.InferInput<TSchemas["inputSchema"]>
          >
        >
    : Record<string, string | string[]>;

// ============================================================================
// STATELESS ACTION (regular server actions)
// ============================================================================

/**
 * Regular server action that doesn't use useActionState.
 */
export type StatelessAction<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = (
  ...args: StatelessActionArgs<TSchemas>
) => Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>>;

/**
 * Arguments for stateless actions: bind args followed by input.
 */
export type StatelessActionArgs<TSchemas extends Schemas> = [
  ...InferRawBindArgs<TSchemas>,
  ...InferRawInputTuple<TSchemas>,
];

// ============================================================================
// CRAFTED ACTION
// ============================================================================

/**
 * Type inference utilities available on crafted actions.
 */
export type CraftedActionInfer<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = {
  /** The raw input type expected by this action */
  Input: InferRawInput<TSchemas>;
  /** The success data type returned by this action's handler */
  Data: TData;
  /** The complete result type returned when calling this action */
  Result: InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
  /** The possible error types that can be returned by this action */
  Errors: PossibleErrors<TErrors, TConfig, TSchemas>;
};

/**
 * Schema validation result for the $validate method.
 */
export type ValidationResult<
  TConfig extends Config,
  TSchemas extends Schemas,
> = TSchemas extends { inputSchema: unknown }
  ?
      | { success: true; data: InferValidatedInput<TSchemas> }
      | { success: false; error: InferInputValidationErrorFormat<TConfig> }
  : {
      success: false;
      error: NoInputSchemaError;
    };

/**
 * The fully-typed server action function returned by the `craft()` method.
 */
export type CraftedAction<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = (TConfig extends { useActionState: true }
  ? StatefulAction<TConfig, TSchemas, TErrors, TData>
  : StatelessAction<TConfig, TSchemas, TErrors, TData>) & {
  /**
   * Type inference utilities for extracting types from this action.
   * Use with `typeof action.$Infer.Input` etc.
   */
  $Infer: CraftedActionInfer<TConfig, TSchemas, TErrors, TData>;

  /**
   * Validates input data against this action's input schema without executing the action.
   * Returns a result object indicating success/failure with typed data or errors.
   *
   * @param input - The input data to validate
   * @returns Promise resolving to validation result with success flag and data/error
   */
  $validate(
    input: InferRawInput<TSchemas>,
  ): Promise<ValidationResult<TConfig, TSchemas>>;
};

/**
 * Result returned when calling a crafted action.
 */
export type InferCraftedActionResult<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = TConfig extends { useActionState: true }
  ? StatefulApiResult<
      TData,
      PossibleErrors<TErrors, TConfig, TSchemas>,
      InferSerializedSuccessValues<TSchemas>,
      InferSerializedErrorValues<TSchemas>
    >
  : TConfig extends { resultFormat: "functional" }
    ? Result<TData, PossibleErrors<TErrors, TConfig, TSchemas>>
    : ApiResult<TData, PossibleErrors<TErrors, TConfig, TSchemas>>;
