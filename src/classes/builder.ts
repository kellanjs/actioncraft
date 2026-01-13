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
// ACTIONCRAFT BUILDER CLASS - Configure and define your action
// ============================================================================

export class ActioncraftBuilder<
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
  ): ActioncraftBuilder<
    TNewConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    unknown
  > {
    return new ActioncraftBuilder(
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
  ): ActioncraftBuilder<
    TConfig,
    TNewSchemas,
    TErrors,
    Record<string, never>,
    unknown
  > {
    return new ActioncraftBuilder(
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
  ): ActioncraftBuilder<
    TConfig,
    TSchemas,
    TNewErrors,
    Record<string, never>,
    unknown
  > {
    return new ActioncraftBuilder(
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
  ): ActioncraftBuilder<
    TConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    InferDataFromHandler<TFn>
  > {
    return new ActioncraftBuilder(
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
  ): ActioncraftBuilder<TConfig, TSchemas, TErrors, TNewCallbacks, TData> {
    return new ActioncraftBuilder(
      this._config,
      this._schemas,
      this._errors,
      callbacks,
      this._handler,
    );
  }

  // --------------------------------------------------------------------------
  // BUILD METHOD - Final step to create the action
  // --------------------------------------------------------------------------

  /**
   * Builds and returns the final executable server action.
   * This is the terminal method for the ActioncraftBuilder fluent API.
   */
  build(): CraftedAction<TConfig, TSchemas, TErrors, TData> {
    const executor = new Executor(this);
    return executor.build();
  }

  /**
   * @returns Internal properties of the ActioncraftBuilder instance
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
 * Entry point to the Actioncraft system.
 * Creates a new ActioncraftBuilder instance for building type-safe server actions.
 *
 * Example Usage:
 * ```ts
 * const myAction = actioncraft()
 *   .config(...)
 *   .schemas(...)
 *   .errors(...)
 *   .handler(...)
 *   .callbacks(...)
 *   .build();
 * ```
 *
 * @returns A new ActioncraftBuilder instance to start building your action.
 */
export function actioncraft(): ActioncraftBuilder<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  unknown
> {
  return new ActioncraftBuilder(
    {} as Record<string, never>,
    {} as Record<string, never>,
    {} as Record<string, never>,
    {} as Record<string, never>,
    undefined,
  );
}
