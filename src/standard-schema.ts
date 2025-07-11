/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** The non-existent issues. */
    readonly issues?: undefined;
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }

  /** The issue interface of the failure output. */
  export interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /** The path segment interface of the issue. */
  export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }

  /** The Standard Schema types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

// ============================================================================
// CUSTOM HELPER TYPES FOR ACTION COMPOSER
// ============================================================================

/** Infer the input type of a Standard Schema, or a default type if the schema is undefined. */
export type InferInputOrDefault<MaybeSchema, Default> =
  MaybeSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<MaybeSchema>
    : Default;

/** Infer the output type of a Standard Schema, or a default type if the schema is undefined. */
export type InferOutputOrDefault<MaybeSchema, Default> =
  MaybeSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<MaybeSchema>
    : Default;

/** Infer the input type of an array of Standard Schemas. */
export type InferInputArray<Schemas extends readonly StandardSchemaV1[]> = {
  [K in keyof Schemas]: StandardSchemaV1.InferInput<Schemas[K]>;
};

/** Infer the output type of an array of Standard Schemas. */
export type InferOutputArray<Schemas extends readonly StandardSchemaV1[]> = {
  [K in keyof Schemas]: StandardSchemaV1.InferOutput<Schemas[K]>;
};

// ============================================================================
// RUNTIME HELPERS
// ============================================================================

/** Helper function to validate input using a Standard Schema. */
export async function standardParse<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): Promise<StandardSchemaV1.Result<Output>> {
  return schema["~standard"].validate(value);
}

/** Type guard to check if a value is a Standard Schema. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as StandardSchemaV1)["~standard"] === "object" &&
    (value as StandardSchemaV1)["~standard"].version === 1
  );
}
