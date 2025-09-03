import { ActioncraftError } from "./classes/error.js";
import type { CraftedAction } from "./types/actions.js";
import type { Config } from "./types/builder.js";
import type { BaseError } from "./types/errors.js";
import { EXTERNAL_ERROR_TYPES } from "./types/errors.js";
import type { InferResult } from "./types/inference.js";
import type { Result } from "./types/result.js";
import { err } from "./types/result.js";
import type {
  ApiResult,
  StatefulApiResult,
  ThrowableAction,
} from "./types/shared.js";

/**
 * Unwraps an Actioncraft result, returning the data or throwing an error.
 * Supports both async and sync usage patterns.
 * Thrown errors automatically include action ID for verification when available.
 */
export async function unwrap<TData, TError extends BaseError>(
  promiseResult: Promise<
    | ApiResult<TData, TError>
    | StatefulApiResult<TData, TError>
    | Result<TData, TError>
  >,
): Promise<TData>;

export function unwrap<TData, TError extends BaseError>(
  result:
    | ApiResult<TData, TError>
    | StatefulApiResult<TData, TError>
    | Result<TData, TError>,
): TData;

export function unwrap<TData, TError extends BaseError>(
  resultOrPromise:
    | ApiResult<TData, TError>
    | StatefulApiResult<TData, TError>
    | Result<TData, TError>
    | Promise<
        | ApiResult<TData, TError>
        | StatefulApiResult<TData, TError>
        | Result<TData, TError>
      >,
): TData | Promise<TData> {
  // Handle Promise case
  if (resultOrPromise instanceof Promise) {
    return resultOrPromise.then((result) => _unwrapSync(result));
  }

  // Handle direct result case
  return _unwrapSync(resultOrPromise);
}

/**
 * Synchronously unwraps a result, throwing on error with embedded action ID.
 */
function _unwrapSync<TData, TError extends BaseError>(
  result:
    | ApiResult<TData, TError>
    | StatefulApiResult<TData, TError>
    | Result<TData, TError>,
): TData {
  // Extract action ID from result if present
  const actionId = "__ac_id" in result ? result.__ac_id : undefined;

  // Handle api-style results ({ success: true/false }) - includes both ApiResult and StatefulApiResult
  if (typeof result === "object" && result !== null && "success" in result) {
    const apiResult = result as
      | ApiResult<TData, TError>
      | StatefulApiResult<TData, TError>;
    if (apiResult.success) {
      return apiResult.data;
    }
    throw new ActioncraftError(apiResult.error, actionId);
  }

  // Handle functional-style results ({ type: "ok"/"err" })
  if (typeof result === "object" && result !== null && "type" in result) {
    const functionalResult = result as Result<TData, TError>;
    if (functionalResult.type === "ok") {
      return functionalResult.value;
    }
    throw new ActioncraftError(functionalResult.error, actionId);
  }

  throw new Error("Invalid result format from Actioncraft action");
}

/**
 * Creates a throwable version of an Actioncraft action.
 * The returned function throws ActioncraftErrors with automatic action ID verification support.
 * Errors thrown by this function can be verified with isActioncraftError(error, action).
 */
export function throwable<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TAction extends CraftedAction<any, any, any, any>,
>(action: TAction): ThrowableAction<TAction> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (async (...args: any[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (action as any)(...args);
    return unwrap(result);
  }) as ThrowableAction<TAction>;
}

/**
 * Creates an appropriate initial state for any action based on its configuration.
 * The initial state uses the action's real ID for consistency with actual results.
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
    message: "Action has not been executed yet",
  } as const;

  // Attempt to read the action ID created during craft()
  const actionId =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((action as any)?.__ac_id as string | undefined) ?? "unknown";

  // Attempt to read the Actioncraft config attached during craft()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (action as any)?.__ac_config as Partial<Config> | undefined;

  // Functional format -> Result<_, _>
  if (cfg?.resultFormat === "functional") {
    return err(error, actionId) as unknown as InferResult<TAction>;
  }

  // useActionState enabled -> StatefulApiResult
  if (cfg?.useActionState) {
    return {
      success: false as const,
      error,
      values: undefined,
      __ac_id: actionId,
    } as unknown as InferResult<TAction>;
  }

  // Default ApiResult shape
  return {
    success: false as const,
    error,
    __ac_id: actionId,
  } as unknown as InferResult<TAction>;
}

/**
 * Utility to extract the action ID from a crafted action.
 * Useful for debugging and logging purposes.
 *
 * @param action - The crafted action
 * @returns The action ID if available, undefined otherwise
 */
export function getActionId<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TAction extends CraftedAction<any, any, any, any>,
>(action: TAction): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (action as any).__ac_id as string | undefined;
}
