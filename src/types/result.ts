// ============================================================================
// Core Result Type
// ============================================================================

/**
 * This is the functional Result type that the library uses for all internal logic.
 * The ApiResult format is returned to the client by default, but the action can be
 * configured to return the functional Result type if desired.
 */

/** A successful result containing a value of type T */
export type Ok<T> = { readonly type: "ok"; readonly value: T };
/** A failed result containing an error of type E */
export type Err<E> = { readonly type: "err"; readonly error: E };
/**
 * A Result represents an operation that can either succeed (Ok) or fail (Err).
 * This is a serializable alternative to throwing exceptions.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a successful result.
 * @param value The success value
 * @returns Ok result containing the value
 */
export function ok<T>(value: T): Ok<T>;
/**
 * Creates a successful result with no value.
 * @returns Ok result with void
 */
export function ok(): Ok<void>;
export function ok<T = void>(value?: T): Ok<T extends void ? void : T> {
  return { type: "ok", value: value } as Ok<T extends void ? void : T>;
}

/**
 * Creates a failed result.
 * @param error The error value
 * @returns Err result containing the error
 */
export function err<E>(error: E): Err<E>;
/**
 * Creates a failed result with no error value.
 * @returns Err result with void
 */
export function err(): Err<void>;
export function err<E = void>(error?: E): Err<E extends void ? void : E> {
  return { type: "err", error: error } as Err<E extends void ? void : E>;
}

/**
 * Tests if a Result is successful.
 * @param result The Result to check
 * @returns true if result is Ok, false if Err
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.type === "ok";
}

/**
 * Tests if a Result is failed.
 * @param result The Result to check
 * @returns true if result is Err, false if Ok
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.type === "err";
}

/**
 * Tests if an unknown value is a valid Result.
 * @param value The value to check
 * @returns true if value is a Result (Ok or Err), false otherwise
 */
export function isResult<T = unknown, E = unknown>(
  value: unknown,
): value is Result<T, E> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    ((value.type === "ok" && "value" in value) ||
      (value.type === "err" && "error" in value))
  );
}

/**
 * Tests if an unknown value is a valid Ok Result.
 * @param value The value to check
 * @returns true if value is an Ok Result, false otherwise
 */
export function isResultOk<_T = unknown, _E = unknown>(
  value: unknown,
): value is Ok<_T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "ok" &&
    "value" in value
  );
}

/**
 * Tests if an unknown value is a valid Err Result.
 * @param value The value to check
 * @returns true if value is an Err Result, false otherwise
 */
export function isResultErr<_T = unknown, E = unknown>(
  value: unknown,
): value is Err<E> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "err" &&
    "error" in value
  );
}
