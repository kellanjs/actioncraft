import type { StandardSchemaV1 } from "../standard-schema.js";
import type { CrafterConfig, CrafterSchemas, CrafterErrors } from "./config.js";
import type {
  ErrorFunctions,
  InferUserDefinedErrorTypes,
  PossibleErrors,
} from "./errors.js";
import type { Result, Ok, Err } from "./result.js";
import type {
  InferValidatedInput,
  InferRawBindArgs,
  InferValidatedBindArgs,
  InferRawInputTuple,
} from "./schemas.js";
import type {
  ApiResult,
  ActionImplMetadata,
  StatefulApiResult,
} from "./shared.js";

// ============================================================================
// ACTION IMPLEMENTATION
// ============================================================================

/**
 * Extracts the success data type from an action implementation function.
 */
export type InferDataFromActionImpl<TFn> = TFn extends (
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
 * Parameters passed to action implementation functions.
 */
export type ActionImplParams<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = {
  /** Validated input data after schema validation */
  input: InferValidatedInput<TSchemas>;
  /** Validated bind arguments after schema validation */
  bindArgs: InferValidatedBindArgs<TSchemas>;
  /** Helper functions for returning typed errors */
  errors: ErrorFunctions<TErrors>;
  /** Action metadata for debugging and logging */
  metadata: ActionImplMetadata<TConfig, TSchemas, TErrors, TData>;
};

/**
 * Action implementation function signature.
 * Can return ok(data), errors.yourError(), raw data, or null.
 * Returning undefined is treated as an error.
 */
export type ActionImpl<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = (
  params: ActionImplParams<TConfig, TSchemas, TErrors, TData>,
) => Promise<
  Result<TData, InferUserDefinedErrorTypes<TErrors>> | TData | undefined
>;

/**
 * Arguments that the action implementation accepts.
 * Differs based on useActionState configuration.
 */
export type InferActionImplArgs<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
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
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = (
  ...args: StatefulActionArgs<TConfig, TSchemas, TErrors, TData>
) => Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>>;

/**
 * Arguments for stateful actions: bind args, previous state, then input.
 */
export type StatefulActionArgs<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
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
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
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
export type InferSerializedSuccessValues<TSchemas extends CrafterSchemas> =
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
export type InferSerializedErrorValues<TSchemas extends CrafterSchemas> =
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
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = (
  ...args: StatelessActionArgs<TSchemas>
) => Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>>;

/**
 * Arguments for stateless actions: bind args followed by input.
 */
export type StatelessActionArgs<TSchemas extends CrafterSchemas> = [
  ...InferRawBindArgs<TSchemas>,
  ...InferRawInputTuple<TSchemas>,
];

// ============================================================================
// CRAFTED ACTION
// ============================================================================

/**
 * Final action function returned by .craft().
 */
export type CraftedAction<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
> = TConfig extends { useActionState: true }
  ? StatefulAction<TConfig, TSchemas, TErrors, TData>
  : StatelessAction<TConfig, TSchemas, TErrors, TData>;

/**
 * Result returned when calling a crafted action.
 */
export type InferCraftedActionResult<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
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
