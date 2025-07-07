import { standardParse } from "../standard-schema.js";
import type {
  CrafterConfig,
  CrafterSchemas,
  CrafterErrors,
} from "../types/config.js";
import { INTERNAL_ERROR_TYPES, EXTERNAL_ERROR_TYPES } from "../types/errors.js";
import type {
  AllPossibleErrors,
  InferInputValidationErrorFormat,
  InferBindArgsValidationErrorFormat,
  InferOutputValidationErrorFormat,
} from "../types/errors.js";
import type { Result } from "../types/result.js";
import { ok, err } from "../types/result.js";
import type {
  InferValidatedInput,
  InferRawInput,
  InferValidatedBindArgs,
  InferRawBindArgs,
} from "../types/schemas.js";
import {
  createValidationError,
  createInternalLogicError,
  formatValidationIssues,
} from "./errors.js";

/**
 * Validate input using the configured input schema.
 */
export async function validateInput<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
>(
  schemas: TSchemas,
  config: TConfig,
  rawInput: InferRawInput<TSchemas> | undefined,
): Promise<
  Result<
    InferValidatedInput<TSchemas>,
    AllPossibleErrors<TErrors, TConfig, TSchemas>
  >
> {
  if (!schemas.inputSchema) {
    return ok(undefined as InferValidatedInput<TSchemas>);
  }

  const result = await standardParse(schemas.inputSchema, rawInput);

  if (Array.isArray(result.issues) && result.issues.length > 0) {
    const format = config.validationErrorFormat ?? "flattened";
    const baseError = formatValidationIssues(result.issues, format);

    const inputValidationError = createValidationError<
      InferInputValidationErrorFormat<TConfig>
    >(
      EXTERNAL_ERROR_TYPES.INPUT_VALIDATION,
      "Input validation failed",
      baseError,
    );

    return err(inputValidationError) as Result<
      never,
      AllPossibleErrors<TErrors, TConfig, TSchemas>
    >;
  }

  if (!result.issues && "value" in result) {
    return ok(result.value as InferValidatedInput<TSchemas>);
  }

  // Should never happen
  const logicErr = createInternalLogicError(
    "Unexpected validation state in input validation: neither success nor failure",
  );
  return err(logicErr) as Result<
    never,
    AllPossibleErrors<TErrors, TConfig, TSchemas>
  >;
}

/**
 * Validate bound arguments using configured bind schemas.
 */
export async function validateBindArgs<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
>(
  schemas: TSchemas,
  config: TConfig,
  bindArgs: InferRawBindArgs<TSchemas>,
): Promise<
  Result<
    InferValidatedBindArgs<TSchemas>,
    AllPossibleErrors<TErrors, TConfig, TSchemas>
  >
> {
  if (!schemas.bindSchemas) {
    return ok([] as InferValidatedBindArgs<TSchemas>);
  }

  const validated: unknown[] = [];

  for (let i = 0; i < schemas.bindSchemas.length; i++) {
    const schema = schemas.bindSchemas[i]!;
    const arg = bindArgs[i];
    const result = await standardParse(schema, arg);

    if (Array.isArray(result.issues) && result.issues.length > 0) {
      const format = config.validationErrorFormat ?? "flattened";
      const baseError = formatValidationIssues(result.issues, format);

      const bindError = createValidationError<
        InferBindArgsValidationErrorFormat<TConfig>
      >(
        EXTERNAL_ERROR_TYPES.BIND_ARGS_VALIDATION,
        "Bind arguments validation failed",
        baseError,
      );

      return err(bindError) as Result<
        never,
        AllPossibleErrors<TErrors, TConfig, TSchemas>
      >;
    }

    if ("value" in result) {
      validated.push(result.value);
    }
  }

  return ok(validated as InferValidatedBindArgs<TSchemas>);
}

/**
 * Validate action output using configured output schema.
 */
export async function validateOutput<
  TConfig extends CrafterConfig,
  TSchemas extends CrafterSchemas,
  TErrors extends CrafterErrors,
  TData,
>(
  schemas: TSchemas,
  config: TConfig,
  data: TData,
): Promise<Result<TData, AllPossibleErrors<TErrors, TConfig, TSchemas>>> {
  if (!schemas.outputSchema) {
    return ok(data);
  }

  const result = await standardParse(schemas.outputSchema, data);

  if (Array.isArray(result.issues) && result.issues.length > 0) {
    const format = config.validationErrorFormat ?? "flattened";
    const baseError = formatValidationIssues(result.issues, format);

    const outputError = createValidationError<
      InferOutputValidationErrorFormat<TConfig>
    >(
      INTERNAL_ERROR_TYPES.OUTPUT_VALIDATION,
      "Output validation failed",
      baseError,
    );

    return err(outputError) as Result<
      never,
      AllPossibleErrors<TErrors, TConfig, TSchemas>
    >;
  }

  if (!result.issues && "value" in result) {
    return ok(result.value as TData);
  }

  const logicErr = createInternalLogicError(
    "Unexpected validation state in output validation: neither success nor failure",
  );
  return err(logicErr) as Result<
    never,
    AllPossibleErrors<TErrors, TConfig, TSchemas>
  >;
}
