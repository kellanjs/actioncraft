import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Schemas } from "./builder.js";
import type {
  MapSchemasToRawInput,
  MapSchemasToValidatedOutput,
} from "./shared.js";

/**
 * Converts input schema to function parameter tuple for the crafted action.
 */
export type InferRawInputTuple<TSchemas extends Schemas> = TSchemas extends {
  inputSchema: StandardSchemaV1;
}
  ? [InferRawInput<TSchemas>]
  : [InferRawInput<TSchemas>?];

/**
 * Raw input type that users pass to the action before validation.
 */
export type InferRawInput<TSchemas extends Schemas> = TSchemas extends {
  inputSchema: StandardSchemaV1;
}
  ? StandardSchemaV1.InferInput<TSchemas["inputSchema"]>
  : unknown;

/**
 * Validated input type that action handlers receive.
 */
export type InferValidatedInput<TSchemas extends Schemas> = TSchemas extends {
  inputSchema: StandardSchemaV1;
}
  ? StandardSchemaV1.InferOutput<TSchemas["inputSchema"]>
  : undefined;

/**
 * Raw input types for bound arguments before validation.
 */
export type InferRawBindArgs<TSchemas extends Schemas> = TSchemas extends {
  bindSchemas: readonly StandardSchemaV1[];
}
  ? MapSchemasToRawInput<TSchemas["bindSchemas"]>
  : [];

/**
 * Validated output types for bound arguments after validation.
 */
export type InferValidatedBindArgs<TSchemas extends Schemas> =
  TSchemas extends {
    bindSchemas: readonly StandardSchemaV1[];
  }
    ? MapSchemasToValidatedOutput<TSchemas["bindSchemas"]>
    : [];
