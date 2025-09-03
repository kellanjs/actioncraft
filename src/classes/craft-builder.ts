import type {
  Handler,
  InferDataFromHandler,
  HandlerParams,
  CraftedAction,
} from "../types/actions.js";
import type { Config, Schemas, Errors, Callbacks } from "../types/builder.js";
import { Executor } from "./executor/executor.js";
import { INTERNAL, type CrafterInternals } from "./internal.js";

// ============================================================================
// CRAFT BUILDER CLASS - Configure and define your action
// ============================================================================

export class CraftBuilder<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TCallbacks extends Callbacks<TConfig, TSchemas, TErrors, TData>,
  TData,
> {
  private readonly _config: TConfig;
  private readonly _schemas: TSchemas;
  private readonly _errors: TErrors;
  private readonly _callbacks: TCallbacks;
  private readonly _handler?: Handler<TConfig, TSchemas, TErrors, TData>;

  constructor(
    config: TConfig,
    schemas: TSchemas,
    errors: TErrors,
    callbacks: TCallbacks,
    handler?: Handler<TConfig, TSchemas, TErrors, TData>,
  ) {
    this._config = config;
    this._schemas = schemas;
    this._errors = errors;
    this._callbacks = callbacks;
    this._handler = handler;
  }

  // --------------------------------------------------------------------------
  // FLUENT API METHODS
  // --------------------------------------------------------------------------

  /**
   * Defines configuration options for the action.
   * Resets previously defined handler and callbacks.
   */
  config<TNewConfig extends Config>(
    config: TNewConfig,
  ): CraftBuilder<
    TNewConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    unknown
  > {
    return new CraftBuilder(
      config,
      this._schemas,
      this._errors,
      {} as Record<string, never>,
      undefined,
    );
  }

  /**
   * Defines validation schemas for input, output, and bind arguments.
   * Resets previously defined handler and callbacks.
   */
  schemas<TNewSchemas extends Schemas>(
    schemas: TNewSchemas,
  ): CraftBuilder<
    TConfig,
    TNewSchemas,
    TErrors,
    Record<string, never>,
    unknown
  > {
    return new CraftBuilder(
      this._config,
      schemas,
      this._errors,
      {} as Record<string, never>,
      undefined,
    );
  }

  /**
   * Defines error functions for returning typed errors from the handler.
   * Resets previously defined handler and callbacks.
   */
  errors<const TNewErrors extends Errors>(
    errors: TNewErrors,
  ): CraftBuilder<
    TConfig,
    TSchemas,
    TNewErrors,
    Record<string, never>,
    unknown
  > {
    return new CraftBuilder(
      this._config,
      this._schemas,
      errors,
      {} as Record<string, never>,
      undefined,
    );
  }

  /**
   * Defines the handler function containing the server action's business logic.
   * Resets previously defined callbacks.
   */
  handler<
    TFn extends (
      params: HandlerParams<TConfig, TSchemas, TErrors, TData>,
    ) => Promise<unknown>,
  >(
    fn: TFn,
  ): CraftBuilder<
    TConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    InferDataFromHandler<TFn>
  > {
    return new CraftBuilder(
      this._config,
      this._schemas,
      this._errors,
      {} as Record<string, never>,
      fn as Handler<TConfig, TSchemas, TErrors, InferDataFromHandler<TFn>>,
    );
  }

  /**
   * Defines lifecycle callbacks to be triggered during the exection of an action.
   * Must be called after handler() for correct type inference.
   */
  callbacks<TNewCallbacks extends Callbacks<TConfig, TSchemas, TErrors, TData>>(
    callbacks: TNewCallbacks,
  ): CraftBuilder<TConfig, TSchemas, TErrors, TNewCallbacks, TData> {
    return new CraftBuilder(
      this._config,
      this._schemas,
      this._errors,
      callbacks,
      this._handler,
    );
  }

  /**
   * @returns Internal properties of the CraftBuilder instance
   */
  [INTERNAL](): CrafterInternals<
    TConfig,
    TSchemas,
    TErrors,
    TCallbacks,
    TData
  > {
    return {
      config: this._config,
      schemas: this._schemas,
      errors: this._errors,
      callbacks: this._callbacks,
      handler: this._handler,
    };
  }
}

// ============================================================================
// PUBLIC API FUNCTION
// ============================================================================

/**
 * Represents the function that the user passes to `craft()` in order to build an action.
 */
type CraftFn<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TCallbacks extends Callbacks<TConfig, TSchemas, TErrors, TData>,
  TData,
> = (
  builder: CraftBuilder<
    Config,
    Record<string, never>,
    Record<string, never>,
    Record<string, never>,
    unknown
  >,
) =>
  | CraftBuilder<TConfig, TSchemas, TErrors, TCallbacks, TData>
  | Promise<CraftBuilder<TConfig, TSchemas, TErrors, TCallbacks, TData>>;

/**
 * One of two entry points to the Actioncraft system.
 * It provides you with an empty CraftBuilder instance on which you can call any of the fluent
 * CraftBuilder methods to configure and define your action.
 *
 * Example Usage:
 * ```ts
 * const myAction = craft(async (action) => {
 *   return action
 *     .config(...)
 *     .schemas(...)
 *     .errors(...)
 *     .handler(...)
 *     .callbacks(...)
 * });
 * ```
 *
 * @param craftFn - The function that the user passes to `craft()` in order to build an action.
 * @returns The fully-typed server action function that can be used in your app.
 */
export function craft<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TCallbacks extends Callbacks<TConfig, TSchemas, TErrors, TData>,
  TData,
>(
  craftFn: CraftFn<TConfig, TSchemas, TErrors, TCallbacks, TData>,
): CraftedAction<TConfig, TSchemas, TErrors, TData> {
  const builder = craftFn(
    new CraftBuilder(
      {} as Config,
      {} as Record<string, never>,
      {} as Record<string, never>,
      {} as Record<string, never>,
      undefined,
    ),
  );

  // Handle async builder functions
  if (builder instanceof Promise) {
    return _craftAsync(builder);
  }

  // Handle sync builder functions
  const executor = new Executor(builder);
  const craftedAction = executor.craft();

  return craftedAction;
}

/**
 * Internal helper function to handle async craft functions.
 * Encapsulates the logic for creating async actions and preserving metadata.
 */
function _craftAsync<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TCallbacks extends Callbacks<TConfig, TSchemas, TErrors, TData>,
  TData,
>(
  builderPromise: Promise<
    CraftBuilder<TConfig, TSchemas, TErrors, TCallbacks, TData>
  >,
): CraftedAction<TConfig, TSchemas, TErrors, TData> {
  // Resolve the builder once and cache the resulting action to ensure consistent IDs
  const actionPromise = builderPromise.then((resolvedBuilder) => {
    const executor = new Executor(resolvedBuilder);
    return executor.craft();
  });

  // For async craft functions, we need to return an async action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asyncAction = (async (...args: any[]) => {
    // Wait for the cached action to be ready
    const craftedAction = await actionPromise;

    // Call the action with the user's arguments
    return craftedAction(...args);
  }) as CraftedAction<TConfig, TSchemas, TErrors, TData>;

  // We need to preserve the config and ID for the initial() function to work
  // We'll use the same cached action to ensure consistent metadata
  actionPromise.then((craftedAction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (asyncAction as any).__ac_config = (craftedAction as any).__ac_config;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (asyncAction as any).__ac_id = (craftedAction as any).__ac_id;
  });

  return asyncAction;
}
