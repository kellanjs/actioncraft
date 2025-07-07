import { safeExecuteCallback } from "./core/callbacks.js";
import {
  createUnhandledErrorResult,
  createImplicitReturnErrorResult,
} from "./core/errors.js";
import { log } from "./core/logging.js";
import {
  serializeRawInput,
  convertToClientError,
} from "./core/transformation.js";
import {
  validateInput,
  validateBindArgs,
  validateOutput,
} from "./core/validation.js";
import type {
  InferPrevStateArg,
  ActionImpl,
  CraftedAction,
  InferCraftedActionResult,
  InferDataFromActionImpl,
  ActionImplParams,
  InferActionImplArgs,
  InferSerializedSuccessValues,
} from "./types/actions.js";
import type {
  CrafterConfig,
  CrafterSchemas,
  CrafterErrors,
  CrafterCallbacks,
} from "./types/config.js";
import {
  type PossibleErrors,
  type AllPossibleErrors,
  type ErrorFunctions,
  EXTERNAL_ERROR_TYPES,
} from "./types/errors.js";
import type { InferResult } from "./types/inference.js";
import type { Result } from "./types/result.js";
import { err, isOk, isResultOk, isResultErr, isErr } from "./types/result.js";
import type {
  InferValidatedInput,
  InferRawBindArgs,
  InferRawInput,
} from "./types/schemas.js";
import type { CallbackMetadata } from "./types/shared.js";
import { unstable_rethrow } from "next/navigation.js";

// ============================================================================
// CRAFTER CLASS - TYPE-SAFE ACTION BUILDER
// ============================================================================

/**
 * Builder class for creating type-safe server actions with validation, error handling, and callbacks.
 */
class Crafter<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TCallbacks extends CrafterCallbacks<TConfig, TSchemas, TErrors, TData>,
  TData,
> {
  private readonly _config: TConfig;
  private readonly _schemas: TSchemas;
  private readonly _errors: TErrors;
  private readonly _callbacks: TCallbacks;
  private readonly _actionImpl?: ActionImpl<TConfig, TSchemas, TErrors, TData>;

  constructor(
    config: TConfig,
    schemas: TSchemas,
    errors: TErrors,
    callbacks: TCallbacks,
    actionImpl?: ActionImpl<TConfig, TSchemas, TErrors, TData>,
  ) {
    this._config = config;
    this._schemas = schemas;
    this._errors = errors;
    this._callbacks = callbacks;
    this._actionImpl = actionImpl;
  }

  // --------------------------------------------------------------------------
  // FLUENT API METHODS
  // --------------------------------------------------------------------------

  /**
   * Defines validation schemas for input, output, and bind arguments.
   * Resets previously defined actions and callbacks.
   */
  schemas<TNewSchemas extends CrafterSchemas>(
    schemas: TNewSchemas,
  ): Crafter<TConfig, TNewSchemas, TErrors, Record<string, never>, unknown> {
    return new Crafter(
      this._config,
      schemas,
      this._errors,
      {} as Record<string, never>,
      undefined,
    );
  }

  /**
   * Defines error functions for returning typed errors from actions.
   * Resets previously defined actions and callbacks.
   */
  errors<const TNewErrors extends CrafterErrors>(
    errors: TNewErrors,
  ): Crafter<TConfig, TSchemas, TNewErrors, Record<string, never>, unknown> {
    return new Crafter(
      this._config,
      this._schemas,
      errors,
      {} as Record<string, never>,
      undefined,
    );
  }

  /**
   * Defines the action implementation function containing business logic.
   * Resets previously defined callbacks.
   */
  action<
    TFn extends (
      params: ActionImplParams<TConfig, TSchemas, TErrors, TData>,
    ) => Promise<unknown>,
  >(
    fn: TFn,
  ): Crafter<
    TConfig,
    TSchemas,
    TErrors,
    Record<string, never>,
    InferDataFromActionImpl<TFn>
  > {
    return new Crafter(
      this._config,
      this._schemas,
      this._errors,
      {} as Record<string, never>,
      fn as ActionImpl<
        TConfig,
        TSchemas,
        TErrors,
        InferDataFromActionImpl<TFn>
      >,
    );
  }

  /**
   * Defines lifecycle callbacks for action execution.
   * Must be called after action() for correct type inference.
   */
  callbacks<
    TNewCallbacks extends CrafterCallbacks<TConfig, TSchemas, TErrors, TData>,
  >(
    callbacks: TNewCallbacks,
  ): Crafter<TConfig, TSchemas, TErrors, TNewCallbacks, TData> {
    return new Crafter(
      this._config,
      this._schemas,
      this._errors,
      callbacks,
      this._actionImpl,
    );
  }

  /**
   * Builds and returns the final executable action function.
   */
  craft(): CraftedAction<TConfig, TSchemas, TErrors, TData> {
    if (!this._actionImpl) {
      throw new Error(
        "Action implementation is not defined. Call .action() before calling .craft().",
      );
    }

    const craftedAction = (
      ...args: InferActionImplArgs<TConfig, TSchemas, TErrors, TData>
    ): Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>> => {
      return this._runAction(args);
    };

    // Attach the action's config for runtime inspection (used by `initial()`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (craftedAction as any).__ac_config = this._config;

    return craftedAction as CraftedAction<TConfig, TSchemas, TErrors, TData>;
  }

  // --------------------------------------------------------------------------
  // ACTION EXECUTION
  // --------------------------------------------------------------------------

  /** Orchestrates action execution including validation, business logic, callbacks, and result formatting. */
  private async _runAction(
    args: InferActionImplArgs<TConfig, TSchemas, TErrors, TData>,
  ): Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>> {
    // We know this exists because craft() verifies it
    const actionImpl = this._actionImpl!;

    // Extract bindArgs, prevState, and input from the raw args
    const {
      bindArgs,
      prevState,
      input: rawInput,
    } = this._extractActionArgs(args);

    // Check for custom error handler
    const handleThrownErrorFn = this._config.handleThrownError
      ? (error: unknown) => err(this._config.handleThrownError!(error))
      : null;

    // Create callback metadata passed to all callbacks
    const callbackMetadata: CallbackMetadata<
      TConfig,
      TSchemas,
      TErrors,
      TData
    > = {
      rawInput,
      prevState,
      validatedInput: undefined, // Set after validation
      validatedBindArgs: undefined, // Set after validation
    };

    try {
      // Validate input and return on failure
      const inputValidation = await this._validateInput(rawInput);
      if (!isOk(inputValidation)) {
        await this._executeCallbacks(inputValidation, callbackMetadata);
        return this._toActionResult(inputValidation, rawInput);
      }

      // Update metadata with validated input
      callbackMetadata.validatedInput = inputValidation.value;

      // Validate bound arguments and return on failure
      const bindArgsValidation = await this._validateBindArgs(bindArgs);
      if (!isOk(bindArgsValidation)) {
        await this._executeCallbacks(bindArgsValidation, callbackMetadata);
        return this._toActionResult(bindArgsValidation, rawInput);
      }

      // Update metadata with validated bind args
      callbackMetadata.validatedBindArgs = bindArgsValidation.value;

      // Execute the user's action implementation
      const actionImplResult = await actionImpl({
        input: inputValidation.value,
        bindArgs: bindArgsValidation.value,
        errors: this._buildErrorFunctions(),
        metadata: { rawInput, prevState },
      });

      // Return on `undefined` (implicit return error)
      if (actionImplResult === undefined) {
        const implicitReturnError = createImplicitReturnErrorResult();
        await this._executeCallbacks(implicitReturnError, callbackMetadata);
        return this._toActionResult(implicitReturnError, rawInput);
      }

      let finalResult: Result<
        TData,
        AllPossibleErrors<TErrors, TConfig, TSchemas>
      >;

      // Process different return types from the action
      if (isResultErr(actionImplResult)) {
        finalResult = actionImplResult;
      } else {
        const outputData = isResultOk(actionImplResult)
          ? actionImplResult.value
          : actionImplResult;
        finalResult = await this._validateOutput(outputData);
      }

      // Execute callbacks and return final result
      await this._executeCallbacks(finalResult, callbackMetadata);

      // Use validated input for the values field on a successful run
      const inputForValues = isOk(finalResult)
        ? this._schemas.inputSchema
          ? (inputValidation.value as InferValidatedInput<TSchemas>)
          : rawInput
        : rawInput;

      return this._toActionResult(finalResult, inputForValues);
    } catch (error) {
      // Re-throw Next.js framework errors
      unstable_rethrow(error);

      // Handle unexpected thrown errors
      try {
        const errorResult = this._handleThrownError(error, handleThrownErrorFn);
        await this._executeCallbacks(errorResult, callbackMetadata);
        return this._toActionResult(errorResult, rawInput);
      } catch (handlerError) {
        // If we catch another error here, then we're done
        log(
          this._config.logger,
          "warn",
          "Error handling failure - both primary error and error handler threw",
          { primaryError: error, handlerError },
        );
        return this._toActionResult(createUnhandledErrorResult(), rawInput);
      }
    }
  }

  /**
   * Extracts bind arguments, previous state, and input from raw action arguments.
   */
  private _extractActionArgs(
    args: InferActionImplArgs<TConfig, TSchemas, TErrors, TData>,
  ): {
    bindArgs: InferRawBindArgs<TSchemas>;
    prevState: InferPrevStateArg<TConfig, TSchemas, TErrors, TData>;
    input: InferRawInput<TSchemas>;
  } {
    const numBindSchemas = this._schemas.bindSchemas?.length ?? 0;

    if (this._config.useActionState) {
      return {
        bindArgs: args.slice(0, numBindSchemas) as InferRawBindArgs<TSchemas>,
        prevState: args[numBindSchemas] as InferPrevStateArg<
          TConfig,
          TSchemas,
          TErrors,
          TData
        >,
        input: args[numBindSchemas + 1] as InferRawInput<TSchemas>,
      };
    }

    return {
      bindArgs: args.slice(0, numBindSchemas) as InferRawBindArgs<TSchemas>,
      // When useActionState is disabled the prevState parameter is never
      // present, so we cast to never (or undefined) to satisfy the type.
      prevState: undefined as unknown as InferPrevStateArg<
        TConfig,
        TSchemas,
        TErrors,
        TData
      >,
      input: args[numBindSchemas] as InferRawInput<TSchemas>,
    };
  }

  // --------------------------------------------------------------------------
  // RESULT TRANSFORMATION
  // --------------------------------------------------------------------------

  /**
   * Transforms internal Result objects to client-facing action result format.
   */
  private _toActionResult(
    result: Result<TData, AllPossibleErrors<TErrors, TConfig, TSchemas>>,
    inputForValues?: InferRawInput<TSchemas> | InferValidatedInput<TSchemas>,
  ): InferCraftedActionResult<TConfig, TSchemas, TErrors, TData> {
    // Convert internal errors to client-facing errors
    const clientResult: Result<
      TData,
      PossibleErrors<TErrors, TConfig, TSchemas>
    > = isOk(result) ? result : err(convertToClientError(result.error));

    // Handle useActionState format (always returns StatefulApiResult)
    if (this._config.useActionState) {
      if (isOk(clientResult)) {
        const successValues = this._schemas.inputSchema
          ? (inputForValues as InferSerializedSuccessValues<TSchemas>)
          : serializeRawInput(inputForValues);

        return {
          success: true,
          data: clientResult.value,
          values: successValues,
        } as InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
      }
      return {
        success: false,
        error: clientResult.error,
        values: serializeRawInput(inputForValues),
      } as InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
    }

    const format = this._config.resultFormat ?? "api";

    // Return functional format if configured
    if (format === "functional") {
      return clientResult as InferCraftedActionResult<
        TConfig,
        TSchemas,
        TErrors,
        TData
      >;
    }

    // Default API format
    if (isOk(clientResult)) {
      return {
        success: true,
        data: clientResult.value,
      } as InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
    }
    return {
      success: false,
      error: clientResult.error,
    } as InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
  }

  // --------------------------------------------------------------------------
  // ERROR HANDLING
  // --------------------------------------------------------------------------

  /**
   * Handles uncaught exceptions during action execution.
   */
  private _handleThrownError(
    error: unknown,
    customHandler: ((err: unknown) => Result<never, object>) | null,
  ): Result<never, AllPossibleErrors<TErrors, TConfig, TSchemas>> {
    const caughtErrorResult = customHandler
      ? customHandler(error)
      : createUnhandledErrorResult();

    return caughtErrorResult as Result<
      never,
      AllPossibleErrors<TErrors, TConfig, TSchemas>
    >;
  }

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Validates input using the shared helper.
   */
  private _validateInput(rawInput: InferRawInput<TSchemas> | undefined) {
    return validateInput<TConfig, TSchemas, TErrors>(
      this._schemas,
      this._config,
      rawInput,
    );
  }

  /**
   * Validates bound arguments using the configured bind schemas.
   */
  private _validateBindArgs(bindArgs: InferRawBindArgs<TSchemas>) {
    return validateBindArgs<TConfig, TSchemas, TErrors>(
      this._schemas,
      this._config,
      bindArgs,
    );
  }

  /**
   * Validates output data using the configured output schema.
   */
  private _validateOutput(data: TData) {
    return validateOutput<TConfig, TSchemas, TErrors, TData>(
      this._schemas,
      this._config,
      data,
    );
  }

  // --------------------------------------------------------------------------
  // CALLBACKS
  // --------------------------------------------------------------------------

  /**
   * Executes appropriate lifecycle callbacks based on the action result.
   */
  private async _executeCallbacks(
    result: Result<TData, AllPossibleErrors<TErrors, TConfig, TSchemas>>,
    metadata: CallbackMetadata<TConfig, TSchemas, TErrors, TData>,
  ): Promise<void> {
    const callbacks = this._callbacks;

    // Success path
    if (isOk(result)) {
      await safeExecuteCallback(
        callbacks.onSuccess
          ? () => callbacks.onSuccess!({ data: result.value, metadata })
          : undefined,
        "onSuccess",
        (level, msg, details) => log(this._config.logger, level, msg, details),
      );
    }

    // Error path
    if (isErr(result)) {
      await safeExecuteCallback(
        callbacks.onError
          ? () => callbacks.onError!({ error: result.error, metadata })
          : undefined,
        "onError",
        (level, msg, details) => log(this._config.logger, level, msg, details),
      );
    }

    // onSettled always runs, regardless of result
    const finalResult = this._toActionResult(result);
    await safeExecuteCallback(
      callbacks.onSettled
        ? () => callbacks.onSettled!({ result: finalResult, metadata })
        : undefined,
      "onSettled",
      (level, msg, details) => log(this._config.logger, level, msg, details),
    );
  }

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  /**
   * Creates error functions that return Result objects when called by action implementations.
   */
  private _buildErrorFunctions(): ErrorFunctions<TErrors> {
    const errorFns = {} as ErrorFunctions<TErrors>;

    for (const [key, errorDefFn] of Object.entries(this._errors)) {
      errorFns[key as keyof TErrors] = ((...args) =>
        err(errorDefFn(...args))) as ErrorFunctions<TErrors>[keyof TErrors];
    }

    return errorFns;
  }
}

// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================

/**
 * Creates a new Crafter instance for building type-safe server actions.
 */
export function create<TConfig extends CrafterConfig = CrafterConfig>(
  config?: TConfig,
): Crafter<
  TConfig,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  unknown
> {
  return new Crafter(
    config ?? ({} as TConfig),
    {},
    {} as Record<string, never>,
    {} as Record<string, never>,
    undefined,
  );
}

/**
 * Creates an appropriate initial state for any action based on its configuration.
 *
 * For useActionState actions: returns StatefulApiResult with error and values
 * For functional format actions: returns Result.err() with error
 * For regular actions: returns ApiResult with error
 *
 * Usage:
 * - useActionState: const [state, action] = useActionState(myAction, initial(myAction))
 * - useState: const [state, setState] = useState(initial(myAction))
 */
export function initial<TAction>(action: TAction): InferResult<TAction> {
  const error = {
    type: EXTERNAL_ERROR_TYPES.INITIAL_STATE,
    message: "No action has been executed yet",
  } as const;

  // Attempt to read the ActionCraft config attached during craft()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (action as any)?.__ac_config as
    | Partial<CrafterConfig>
    | undefined;

  // Functional format -> Result<_, _>
  if (cfg?.resultFormat === "functional") {
    return err(error) as unknown as InferResult<TAction>;
  }

  // useActionState enabled -> StatefulApiResult
  if (cfg?.useActionState) {
    return {
      success: false as const,
      error,
      values: undefined,
    } as unknown as InferResult<TAction>;
  }

  // Default ApiResult shape
  return {
    success: false as const,
    error,
  } as unknown as InferResult<TAction>;
}
