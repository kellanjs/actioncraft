import type {
  Handler,
  CraftedAction,
  InferDataFromHandler,
  HandlerParams,
} from "../types/actions.js";
import type { Config, Schemas, Errors, Callbacks } from "../types/builder.js";
import { CraftBuilder } from "./craft-builder.js";
import { Executor } from "./executor/executor.js";

// ============================================================================
// ACTION BUILDER CLASS - Alternative fluent API syntax ending with craft()
// ============================================================================

export class ActionBuilder<
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
  // FLUENT API METHODS (same as CraftBuilder)
  // --------------------------------------------------------------------------

  /**
   * Defines configuration options for the action.
   * Resets previously defined handler and callbacks.
   */
  config<TNewConfig extends Config>(
    config: TNewConfig,
  ): ActionBuilder<
    TNewConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    unknown
  > {
    return new ActionBuilder(
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
  ): ActionBuilder<
    TConfig,
    TNewSchemas,
    TErrors,
    Record<string, never>,
    unknown
  > {
    return new ActionBuilder(
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
  ): ActionBuilder<
    TConfig,
    TSchemas,
    TNewErrors,
    Record<string, never>,
    unknown
  > {
    return new ActionBuilder(
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
  ): ActionBuilder<
    TConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    InferDataFromHandler<TFn>
  > {
    return new ActionBuilder(
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
  ): ActionBuilder<TConfig, TSchemas, TErrors, TNewCallbacks, TData> {
    return new ActionBuilder(
      this._config,
      this._schemas,
      this._errors,
      callbacks,
      this._handler,
    );
  }

  // --------------------------------------------------------------------------
  // CRAFT METHOD - Final step to create the action
  // --------------------------------------------------------------------------

  /**
   * Builds and returns the final executable server action.
   * This is the terminal method for the ActionBuilder fluent API.
   */
  craft(): CraftedAction<TConfig, TSchemas, TErrors, TData> {
    // Convert ActionBuilder to CraftBuilder and use existing Executor logic
    const builder = new CraftBuilder(
      this._config,
      this._schemas,
      this._errors,
      this._callbacks,
      this._handler,
    );

    const executor = new Executor(builder);
    return executor.craft();
  }
}

// ============================================================================
// PUBLIC API FUNCTION
// ============================================================================

/**
 * One of two entry points to the Actioncraft system.
 * Creates a new ActionBuilder instance for the fluent API that ends with craft().
 * This provides an alternative syntax for building your server actions.
 *
 * Example Usage:
 * ```ts
 * const myAction = action()
 *   .config(...)
 *   .schemas(...)
 *   .errors(...)
 *   .handler(...)
 *   .callbacks(...)
 *   .craft();
 * ```
 *
 * @returns A new ActionBuilder instance to start building your action.
 */
export function action(): ActionBuilder<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  unknown
> {
  return new ActionBuilder(
    {} as Record<string, never>,
    {} as Record<string, never>,
    {} as Record<string, never>,
    {} as Record<string, never>,
    undefined,
  );
}
