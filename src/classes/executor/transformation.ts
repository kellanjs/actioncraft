import type { InferSerializedErrorValues } from "../../types/actions.js";
import type { Schemas } from "../../types/builder.js";
import type { Config, Errors } from "../../types/builder.js";
import type { PossibleErrors, AllPossibleErrors } from "../../types/errors.js";
import { INTERNAL_ERROR_TYPES } from "../../types/errors.js";
import type {
  InferRawInput,
  InferValidatedInput,
} from "../../types/schemas.js";
import { UNHANDLED_ERROR } from "./errors.js";

/**
 * Converts input to a serializable format for the `values` field in action results.
 *
 * If the input is `FormData`, it is flattened into a plain object so that it can
 * be safely JSON-serialized. Otherwise, the input is returned as-is.
 */
export function serializeRawInput<TSchemas extends Schemas>(
  input: InferRawInput<TSchemas> | InferValidatedInput<TSchemas> | undefined,
): InferSerializedErrorValues<TSchemas> {
  if (input instanceof FormData) {
    const valueMap = new Map<string, string[]>();

    for (const [key, value] of input.entries()) {
      // Ignore React server-action meta-fields
      if (key.startsWith("$ACTION")) continue;

      const stringValue =
        typeof value === "string" ? value : value.name || "[File]";

      if (!valueMap.has(key)) valueMap.set(key, []);
      valueMap.get(key)!.push(stringValue);
    }

    // Collapse single-item arrays
    const serialized: Record<string, string | string[]> = {};
    for (const [key, values] of valueMap.entries()) {
      serialized[key] = values.length === 1 ? values[0]! : values;
    }

    return serialized as InferSerializedErrorValues<TSchemas>;
  }

  // Non-FormData inputs are assumed to already be serialisable
  return input as InferSerializedErrorValues<TSchemas>;
}

/**
 * Converts internal error objects into client-facing errors, hiding
 * implementation details that should not leak outside the server.
 */
export function convertToClientError<
  TErrors extends Errors,
  TConfig extends Config,
  TSchemas extends Schemas,
>(
  internalError: AllPossibleErrors<TErrors, TConfig, TSchemas>,
): PossibleErrors<TErrors, TConfig, TSchemas> {
  if (
    internalError.type === INTERNAL_ERROR_TYPES.IMPLICIT_RETURN ||
    internalError.type === INTERNAL_ERROR_TYPES.OUTPUT_VALIDATION ||
    internalError.type === INTERNAL_ERROR_TYPES.INTERNAL_LOGIC
  ) {
    return UNHANDLED_ERROR as PossibleErrors<TErrors, TConfig, TSchemas>;
  }
  return internalError as PossibleErrors<TErrors, TConfig, TSchemas>;
}
