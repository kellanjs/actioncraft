import type { CraftedAction } from "./types/actions.js";
import type { BaseError } from "./types/errors.js";
import type { InferErrors } from "./types/inference.js";

/**
 * Error wrapper that provides standard Error semantics while preserving
 * the original ActionCraft error data in the cause property.
 */
export class ActionCraftError<
  TErrorData extends BaseError = BaseError,
> extends Error {
  public override readonly cause: TErrorData;

  constructor(errorData: TErrorData) {
    super(
      `ActionCraft Error: ${errorData.type}${
        "message" in errorData ? ` - ${errorData.message}` : ""
      }`,
    );
    this.name = "ActionCraftError";
    this.cause = errorData;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ActionCraftError.prototype);
  }
}

/**
 * Type guard to check if an error is an ActionCraftError with the action's error types.
 * The action parameter is used purely for type inference.
 */
export function isActionCraftError<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TAction extends CraftedAction<any, any, any, any>,
>(
  error: unknown,
  _action: TAction,
): error is ActionCraftError<InferErrors<TAction>> {
  return error instanceof ActionCraftError;
}
