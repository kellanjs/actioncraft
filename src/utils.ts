import { ActionCraftError } from "./error.js";
import type { CraftedAction } from "./types/actions.js";
import type { BaseError } from "./types/errors.js";
import type { Result } from "./types/result.js";
import type { ApiResult, ThrowableAction } from "./types/shared.js";

/**
 * Unwraps an ActionCraft result, returning the data or throwing an error.
 * Supports both async and sync usage patterns.
 */
export async function unwrap<TData, TError extends BaseError>(
  promiseResult: Promise<ApiResult<TData, TError> | Result<TData, TError>>,
): Promise<TData>;

export function unwrap<TData, TError extends BaseError>(
  result: ApiResult<TData, TError> | Result<TData, TError>,
): TData;

export function unwrap<TData, TError extends BaseError>(
  resultOrPromise:
    | ApiResult<TData, TError>
    | Result<TData, TError>
    | Promise<ApiResult<TData, TError> | Result<TData, TError>>,
): TData | Promise<TData> {
  // Handle Promise case
  if (resultOrPromise instanceof Promise) {
    return resultOrPromise.then((result) => _unwrapSync(result));
  }

  // Handle direct result case
  return _unwrapSync(resultOrPromise);
}

/**
 * Synchronously unwraps a result, throwing on error.
 */
function _unwrapSync<TData, TError extends BaseError>(
  result: ApiResult<TData, TError> | Result<TData, TError>,
): TData {
  // Handle api-style results ({ success: true/false })
  if (typeof result === "object" && result !== null && "success" in result) {
    const apiResult = result as ApiResult<TData, TError>;
    if (apiResult.success) {
      return apiResult.data;
    }
    throw new ActionCraftError(apiResult.error);
  }

  // Handle functional-style results ({ type: "ok"/"err" })
  if (typeof result === "object" && result !== null && "type" in result) {
    const functionalResult = result as Result<TData, TError>;
    if (functionalResult.type === "ok") {
      return functionalResult.value;
    }
    throw new ActionCraftError(functionalResult.error);
  }

  throw new Error("Invalid result format from ActionCraft action");
}

/**
 * Creates a throwable version of an ActionCraft action.
 * The returned function throws on error instead of returning Result objects.
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
