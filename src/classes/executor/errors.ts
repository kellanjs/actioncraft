import type { StandardSchemaV1 } from "../../standard-schema.js";
import {
  EXTERNAL_ERROR_TYPES,
  INTERNAL_ERROR_TYPES,
} from "../../types/errors.js";
import type {
  UnhandledError,
  ImplicitReturnError,
  InternalLogicError,
  ValidationErrorFormat,
  NoInputSchemaError,
} from "../../types/errors.js";
import type { Result } from "../../types/result.js";
import { err } from "../../types/result.js";

// ===========================================================================
// CONSTANTS
// ===========================================================================

export const UNHANDLED_ERROR: UnhandledError = {
  type: EXTERNAL_ERROR_TYPES.UNHANDLED,
  message: "An unhandled error occurred",
} as const;

export const IMPLICIT_RETURN_ERROR: ImplicitReturnError = {
  type: INTERNAL_ERROR_TYPES.IMPLICIT_RETURN,
  message: "Action handler must return a value",
} as const;

export const NO_INPUT_SCHEMA_ERROR: NoInputSchemaError = {
  type: "NO_INPUT_SCHEMA",
  message: "Cannot validate input: no input schema defined for this action",
} as const;

// ===========================================================================
// FACTORY HELPERS
// ===========================================================================

/**
 * Creates internal logic errors with custom messages.
 */
export const createInternalLogicError = (
  message: string,
): InternalLogicError => ({
  type: INTERNAL_ERROR_TYPES.INTERNAL_LOGIC,
  message,
});

/**
 * Creates Result objects for unhandled errors.
 */
export function createUnhandledErrorResult<
  TData = never,
  TError = UnhandledError,
>(actionId: string, actionName?: string): Result<TData, TError> {
  const message = actionName
    ? `An unhandled error occurred in action "${actionName}"`
    : "An unhandled error occurred";

  return err({ ...UNHANDLED_ERROR, message }, actionId) as Result<
    TData,
    TError
  >;
}

/**
 * Creates Result objects for implicit return errors.
 */
export function createImplicitReturnErrorResult<
  TData = never,
  TError = ImplicitReturnError,
>(actionId: string, actionName?: string): Result<TData, TError> {
  const message = actionName
    ? `Action handler "${actionName}" must return a value`
    : "Action handler must return a value";

  return err({ ...IMPLICIT_RETURN_ERROR, message }, actionId) as Result<
    TData,
    TError
  >;
}

// ===========================================================================
// VALIDATION-ERROR STRUCTURING HELPERS
// ===========================================================================

/**
 * Normalises Standard Schema path segments to string|number for serialization.
 */
function _normalisePath(
  path?: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>,
): (string | number)[] {
  if (!path) return [];

  return path
    .map((segment) => {
      if (typeof segment === "symbol") return undefined;

      if (typeof segment === "object" && segment !== null && "key" in segment) {
        const key = (segment as StandardSchemaV1.PathSegment).key;
        return typeof key === "symbol" ? undefined : (key as string | number);
      }

      return segment as string | number;
    })
    .filter((p): p is string | number => p !== undefined);
}

/**
 * Formats validation issues into structured error objects based on the configured format.
 */
export function formatValidationIssues(
  issues: readonly StandardSchemaV1.Issue[],
  format: "flattened" | "nested",
): ValidationErrorFormat {
  if (format === "nested") {
    const formErrors: string[] = [];
    const fieldErrors: { [path: string]: string[] } = {};

    for (const issue of issues) {
      const currentPath = _normalisePath(issue.path);

      if (currentPath.length === 0) {
        formErrors.push(issue.message);
      } else {
        const pathKey = currentPath.join(".");
        if (!fieldErrors[pathKey]) fieldErrors[pathKey] = [];
        fieldErrors[pathKey].push(issue.message);
      }
    }
    return { formErrors, fieldErrors };
  }

  // Default to 'flattened'
  return {
    issues: issues.map(({ path, message }) => ({
      path: _normalisePath(path),
      message,
    })),
  };
}

// ===========================================================================
// VALIDATION ERROR BUILDERS
// ===========================================================================

type ValidationErrorType =
  | typeof EXTERNAL_ERROR_TYPES.INPUT_VALIDATION
  | typeof EXTERNAL_ERROR_TYPES.BIND_ARGS_VALIDATION
  | typeof INTERNAL_ERROR_TYPES.OUTPUT_VALIDATION;

function _buildFlattenedValidationError<TError>(
  type: ValidationErrorType,
  message: string,
  issues: { path: (string | number)[]; message: string }[],
): TError {
  return { type, message, issues } as TError;
}

function _buildNestedValidationError<TError>(
  type: ValidationErrorType,
  message: string,
  formErrors: string[],
  fieldErrors: Record<string, string[]>,
): TError {
  return { type, message, formErrors, fieldErrors } as TError;
}

/**
 * Creates validation error objects.
 */
export function createValidationError<TError>(
  type: ValidationErrorType,
  message: string,
  errorStructure: ValidationErrorFormat,
  actionName?: string,
): TError {
  const enhancedMessage = actionName
    ? `${message} in action "${actionName}"`
    : message;

  if ("issues" in errorStructure) {
    return _buildFlattenedValidationError(
      type,
      enhancedMessage,
      errorStructure.issues,
    );
  }

  return _buildNestedValidationError(
    type,
    enhancedMessage,
    errorStructure.formErrors,
    errorStructure.fieldErrors,
  );
}
