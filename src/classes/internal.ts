import type { Handler } from "../types/actions.js";
import type { Config, Schemas, Errors, Callbacks } from "../types/builder.js";

// ============================================================================
// INTERNAL INTERFACE FOR CRAFTER-EXECUTOR COMMUNICATION
// ============================================================================

export const INTERNAL = Symbol("INTERNAL");

export interface CrafterInternals<
  TConfig extends Config,
  TSchemas extends Schemas,
  TErrors extends Errors,
  TCallbacks extends Callbacks<TConfig, TSchemas, TErrors, TData>,
  TData,
> {
  config: TConfig;
  schemas: TSchemas;
  errors: TErrors;
  callbacks: TCallbacks;
  handler?: Handler<TConfig, TSchemas, TErrors, TData>;
}
