import type { StandardSchemaV1 } from "../standard-schema.js";
import type { InferCraftedActionResult } from "./actions.js";
import type {
  AllPossibleErrors,
  ErrorDefinition,
  UserDefinedError,
} from "./errors.js";
import type { CallbackMetadata } from "./shared.js";

/**
 * Custom logging interface for Actioncraft.
 */
export type Logger = {
  /** Called when callback functions fail */
  error?: (message: string, error: unknown) => void;
  /** Called when Actioncraft detects internal bugs */
  warn?: (message: string, details?: unknown) => void;
};

/**
 * Configuration options for crafting actions.
 */
export type Config = {
  /**
   * Optional name for this action.
   * When provided, error messages will include this identifier to help with debugging.
   */
  actionName?: string;

  /**
   * Result format returned by actions.
   * "api" returns {success, data/error}, "functional" returns {type, value/error}.
   * Ignored when useActionState is enabled.
   * @default "api"
   */
  resultFormat?: "api" | "functional";

  /**
   * Validation error structure.
   * "flattened" returns array of {path, message}, "nested" groups by field.
   * @default "flattened"
   */
  validationErrorFormat?: "flattened" | "nested";

  /**
   * Enables React useActionState compatibility.
   * Action accepts prevState parameter and returns a stateful result.
   * @default false
   */
  useActionState?: boolean;

  /**
   * Custom handler for unexpected thrown errors.
   * Transforms exceptions into structured error objects.
   */
  handleThrownError?: (error: unknown) => UserDefinedError;

  /**
   * Logger for Actioncraft internal events.
   */
  logger?: Logger;
};

/**
 * Schema definitions for validating inputs and outputs.
 */
export type Schemas = {
  /** Validates input values passed to the action */
  inputSchema?: StandardSchemaV1;

  /** Validates success data returned from the action */
  outputSchema?: StandardSchemaV1;

  /** Array of schemas for validating bound arguments */
  bindSchemas?: readonly StandardSchemaV1[];
};

/**
 * Custom error types that actions can return.
 * Each property is a function that creates a typed error object.
 */
export type Errors = Record<string, ErrorDefinition>;

/**
 * Lifecycle hooks that run during action execution.
 * Callback errors are logged but do not affect action results.
 */
export type Callbacks<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TData,
> = {
  /** Called when action starts executing, before any validation. */
  onStart?: (params: {
    metadata: CallbackMetadata<TConfig, TSchemas, TErrors, TData>;
  }) => Promise<void> | void;

  /** Called when action fails. */
  onError?: (params: {
    error: AllPossibleErrors<TErrors, TConfig, TSchemas>;
    metadata: CallbackMetadata<TConfig, TSchemas, TErrors, TData>;
  }) => Promise<void> | void;

  /** Called when action succeeds. */
  onSuccess?: (params: {
    data: TData;
    metadata: CallbackMetadata<TConfig, TSchemas, TErrors, TData>;
  }) => Promise<void> | void;

  /** Called after action finishes, regardless of success or failure. */
  onSettled?: (params: {
    result: InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
    metadata: CallbackMetadata<TConfig, TSchemas, TErrors, TData>;
  }) => Promise<void> | void;
};
