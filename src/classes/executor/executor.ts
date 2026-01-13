import type {
  InferPrevStateArg,
  Handler,
  CraftedAction,
  InferCraftedActionResult,
  InferHandlerArgs,
  InferSerializedSuccessValues,
  ValidationResult,
} from "../../types/actions.js";
import type {
  Config,
  Schemas,
  Errors,
  Callbacks,
} from "../../types/builder.js";
import {
  type PossibleErrors,
  type AllPossibleErrors,
  type ErrorFunctions,
} from "../../types/errors.js";
import type { Result } from "../../types/result.js";
import {
  err,
  isOk,
  isResultOk,
  isResultErr,
  isErr,
} from "../../types/result.js";
import type {
  InferValidatedInput,
  InferValidatedBindArgs,
  InferRawBindArgs,
  InferRawInput,
} from "../../types/schemas.js";
import type { CallbackMetadata } from "../../types/shared.js";
import type { ActioncraftBuilder } from "../builder.js";
import { INTERNAL } from "../internal.js";
import { safeExecuteCallback } from "./callbacks.js";
import {
  createUnhandledErrorResult,
  createImplicitReturnErrorResult,
  NO_INPUT_SCHEMA_ERROR,
} from "./errors.js";
import { log } from "./logging.js";
import { serializeRawInput, convertToClientError } from "./transformation.js";
import {
  validateInput,
  validateBindArgs,
  validateOutput,
} from "./validation.js";
import { unstable_rethrow } from "next/navigation.js";

// ============================================================================
// EXECUTOR CLASS - Build and execute your action
// ============================================================================

export class Executor<
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
  private _actionId?: string;

  constructor(
    builder: ActioncraftBuilder<TConfig, TSchemas, TErrors, TCallbacks, TData>,
  ) {
    this._config = builder[INTERNAL]().config;
    this._schemas = builder[INTERNAL]().schemas;
    this._errors = builder[INTERNAL]().errors;
    this._callbacks = builder[INTERNAL]().callbacks;
    this._handler = builder[INTERNAL]().handler;
  }

  /**
   * Builds and returns the final executable server action.
   */
  build(): CraftedAction<TConfig, TSchemas, TErrors, TData> {
    if (!this._handler) {
      throw new Error("A handler implementation is required");
    }

    // Generate a unique ID for this action instance
    this._actionId = this._generateActionId();

    const craftedAction = (
      ...args: InferHandlerArgs<TConfig, TSchemas, TErrors, TData>
    ): Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>> => {
      return this._runAction(args);
    };

    // Attach $validate method to the action for simple client-side validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (craftedAction as any).$validate = async (input: any) => {
      return this._validateInputOnly(input);
    };

    // Attach the action's config and ID for runtime inspection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (craftedAction as any).__ac_config = this._config;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (craftedAction as any).__ac_id = this._actionId;

    return craftedAction as CraftedAction<TConfig, TSchemas, TErrors, TData>;
  }

  /**
   * Generates a unique identifier for this action instance.
   */
  private _generateActionId(): string {
    return crypto.randomUUID();
  }

  // --------------------------------------------------------------------------
  // ACTION EXECUTION
  // --------------------------------------------------------------------------

  /**
   * Orchestrates action execution (validation, business logic, callbacks, and result formatting.)
   */
  private async _runAction(
    args: InferHandlerArgs<TConfig, TSchemas, TErrors, TData>,
  ): Promise<InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>> {
    // We know these exist because craft() creates/verifies them
    const handler = this._handler!;
    const actionId = this._actionId!;
    const actionName = this._config.actionName;

    // Extract bindArgs, prevState, and input from the raw args
    const {
      bindArgs: rawBindArgs,
      prevState,
      input: rawInput,
    } = this._extractActionArgs(args);

    // Check for custom error handler
    const handleThrownErrorFn = this._config.handleThrownError
      ? (error: unknown) =>
          err(this._config.handleThrownError!(error), actionId)
      : null;

    // Track validation state for error handling
    let validatedInput: InferValidatedInput<TSchemas> | undefined = undefined;
    let validatedBindArgs: InferValidatedBindArgs<TSchemas> | undefined =
      undefined;

    try {
      // Execute onStart callback before any processing
      await this._executeOnStartCallback({
        actionId,
        actionName,
        rawInput,
        rawBindArgs,
        prevState,
        validatedInput: undefined,
        validatedBindArgs: undefined,
      });

      // Validate input and return on failure
      const inputValidation = await this._validateInput(rawInput);
      if (!isOk(inputValidation)) {
        await this._executeResultCallbacks(inputValidation, {
          actionId,
          actionName,
          rawInput,
          rawBindArgs,
          prevState,
          validatedInput,
          validatedBindArgs,
        });
        return this._toActionResult(inputValidation, rawInput);
      }

      // Update validation state
      validatedInput = inputValidation.value;

      // Validate bound arguments and return on failure
      const bindArgsValidation = await this._validateBindArgs(rawBindArgs);
      if (!isOk(bindArgsValidation)) {
        await this._executeResultCallbacks(bindArgsValidation, {
          actionId,
          actionName,
          rawInput,
          rawBindArgs,
          prevState,
          validatedInput,
          validatedBindArgs,
        });
        return this._toActionResult(bindArgsValidation, rawInput);
      }

      // Update validation state
      validatedBindArgs = bindArgsValidation.value;

      // Execute the user's action handler
      const handlerResult = await handler({
        input: inputValidation.value,
        bindArgs: bindArgsValidation.value,
        errors: this._buildErrorFunctions(),
        metadata: {
          actionId,
          actionName,
          rawInput,
          rawBindArgs,
          prevState,
        },
      });

      // Return on `undefined` (implicit return error)
      if (handlerResult === undefined) {
        const implicitReturnError = createImplicitReturnErrorResult(
          actionId,
          actionName,
        );
        await this._executeResultCallbacks(implicitReturnError, {
          actionId,
          actionName,
          rawInput,
          rawBindArgs,
          prevState,
          validatedInput,
          validatedBindArgs,
        });
        return this._toActionResult(implicitReturnError, rawInput);
      }

      let finalResult: Result<
        TData,
        AllPossibleErrors<TErrors, TConfig, TSchemas>
      >;

      // Process different return types from the action
      if (isResultErr(handlerResult)) {
        // Ensure error result has correct action ID
        finalResult = this._ensureResultActionId(handlerResult);
      } else {
        const outputData = isResultOk(handlerResult)
          ? handlerResult.value
          : handlerResult;
        finalResult = await this._validateOutput(outputData);
      }

      // Execute callbacks and return final result
      await this._executeResultCallbacks(finalResult, {
        actionId,
        actionName,
        rawInput,
        rawBindArgs,
        prevState,
        validatedInput,
        validatedBindArgs,
      });

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
        await this._executeResultCallbacks(errorResult, {
          actionId,
          actionName,
          rawInput,
          rawBindArgs,
          prevState,
          validatedInput,
          validatedBindArgs,
        });
        return this._toActionResult(errorResult, rawInput);
      } catch (handlerError) {
        // If we catch another error here, then we're done
        log(
          this._config.logger,
          "warn",
          "Error handling failure - both primary error and error handler threw",
          { primaryError: error, handlerError },
        );
        return this._toActionResult(
          createUnhandledErrorResult(actionId, actionName),
          rawInput,
        );
      }
    }
  }

  /**
   * Extracts bind arguments, previous state, and input from raw action arguments.
   */
  private _extractActionArgs(
    args: InferHandlerArgs<TConfig, TSchemas, TErrors, TData>,
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

    // For regular actions (non-useActionState), the input is the first argument after bind args
    // If there are no bind schemas, the input is the first argument (args[0])
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
    > = isOk(result)
      ? result
      : err(convertToClientError(result.error), this._actionId!);

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
          __ac_id: this._actionId!,
        } as InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
      }
      return {
        success: false,
        error: clientResult.error,
        values: serializeRawInput(inputForValues),
        __ac_id: this._actionId!,
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
        __ac_id: this._actionId!,
      } as InferCraftedActionResult<TConfig, TSchemas, TErrors, TData>;
    }
    return {
      success: false,
      error: clientResult.error,
      __ac_id: this._actionId!,
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
      : createUnhandledErrorResult(this._actionId!, this._config.actionName);

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
      this._actionId!,
      this._config.actionName,
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
      this._actionId!,
      this._config.actionName,
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
      this._actionId!,
      this._config.actionName,
    );
  }

  /**
   * Validates input data only (used by the $validate method).
   */
  private async _validateInputOnly(
    input: InferRawInput<TSchemas>,
  ): Promise<ValidationResult<TConfig, TSchemas>> {
    // If no input schema, return error indicating validation cannot be performed
    if (!this._schemas.inputSchema) {
      return {
        success: false,
        error: NO_INPUT_SCHEMA_ERROR,
      } as ValidationResult<TConfig, TSchemas>;
    }

    const validationResult = await this._validateInput(input);

    if (isOk(validationResult)) {
      return {
        success: true,
        data: validationResult.value,
      } as ValidationResult<TConfig, TSchemas>;
    } else {
      // Convert internal error to client-facing error
      const clientError = convertToClientError(validationResult.error);
      return { success: false, error: clientError } as ValidationResult<
        TConfig,
        TSchemas
      >;
    }
  }

  // --------------------------------------------------------------------------
  // CALLBACKS
  // --------------------------------------------------------------------------

  /**
   * Executes the onStart callback if defined.
   */
  private async _executeOnStartCallback(
    metadata: CallbackMetadata<TConfig, TSchemas, TErrors, TData>,
  ): Promise<void> {
    const callbacks = this._callbacks;
    if (callbacks.onStart) {
      await safeExecuteCallback(
        () => callbacks.onStart!({ metadata }),
        "onStart",
        (level, msg, details) => log(this._config.logger, level, msg, details),
      );
    }
  }

  /**
   * Executes result-based lifecycle callbacks (onSuccess, onError, onSettled).
   */
  private async _executeResultCallbacks(
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
   * Ensures a Result object has the correct action ID.
   */
  private _ensureResultActionId<T, E>(result: Result<T, E>): Result<T, E> {
    if (!result.__ac_id || result.__ac_id === "unknown") {
      return {
        ...result,
        __ac_id: this._actionId!,
      };
    }
    return result;
  }

  /**
   * Creates error functions that return a Result object when called by the action handler.
   */
  private _buildErrorFunctions(): ErrorFunctions<TErrors> {
    const errorFns = {} as ErrorFunctions<TErrors>;

    for (const [key, errorDefFn] of Object.entries(this._errors)) {
      errorFns[key as keyof TErrors] = ((...args) =>
        err(
          errorDefFn(...args),
          this._actionId!,
        )) as ErrorFunctions<TErrors>[keyof TErrors];
    }

    return errorFns;
  }
}
