import type { CraftedAction } from "../types/actions.js";
import type { BaseError } from "../types/errors.js";
import type { InferErrors } from "../types/inference.js";

/**
 * Error wrapper that provides standard Error semantics while preserving
 * the original Actioncraft error data in the cause property.
 */
export class ActioncraftError<
  TErrorData extends BaseError = BaseError,
> extends Error {
  public override readonly cause: TErrorData;
  public readonly actionId?: string;

  constructor(errorData: TErrorData, actionId?: string) {
    super(
      `Actioncraft Error: ${errorData.type}${
        "message" in errorData ? ` - ${errorData.message}` : ""
      }`,
    );
    this.name = "ActioncraftError";
    this.cause = errorData;
    this.actionId = actionId;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ActioncraftError.prototype);
  }
}

/**
 * Type guard to check if an error is an ActioncraftError.
 *
 * When called with just an error, performs basic structural validation.
 * When called with an error and action, performs verified action ID checking.
 *
 * @param error - The unknown error to check
 * @param action - Optional action for verified checking and type inference
 * @returns Type predicate indicating if error is ActioncraftError
 */
export function isActioncraftError<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TAction extends CraftedAction<any, any, any, any>,
>(
  error: unknown,
  action?: TAction,
): error is ActioncraftError<
  TAction extends undefined ? BaseError : InferErrors<TAction>
> {
  if (!(error instanceof ActioncraftError)) {
    return false;
  }

  // Verify the cause property exists and has the expected BaseError structure
  const cause = error.cause;
  if (!cause || typeof cause !== "object") {
    return false;
  }

  // Verify the cause has a type property that's a string (required by BaseError)
  if (!("type" in cause) || typeof cause.type !== "string") {
    return false;
  }

  // If message exists, it should be a string (optional in BaseError)
  if (
    "message" in cause &&
    cause.message !== undefined &&
    typeof cause.message !== "string"
  ) {
    return false;
  }

  // If no action provided, just do structural validation
  if (!action) {
    return true;
  }

  // If action provided, verify the action ID matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actionId = (action as any).__ac_id as string | undefined;

  // Both action and error must have IDs for verification to be possible
  if (!actionId || !error.actionId) {
    return false;
  }

  // Check if the error's action ID matches the action's ID
  return error.actionId === actionId;
}
