import { craft } from "../../../src/index";
import type {
  InferInput,
  InferResult,
  InferData,
  InferErrors,
} from "../../../src/types/inference";
import {
  stringSchema,
  numberSchema,
  userSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";

describe("TypeScript Type Inference", () => {
  describe("Input type inference", () => {
    it("should infer correct input types from schemas", () => {
      const stringAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      const numberAction = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => input),
      );

      const userAction = craft((action) =>
        action
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => input),
      );

      // Type assertions to verify inference
      type StringInput = InferInput<typeof stringAction>;
      type NumberInput = InferInput<typeof numberAction>;
      type UserInput = InferInput<typeof userAction>;

      // These should compile without errors if types are correctly inferred
      const stringInput: StringInput = "test";
      const numberInput: NumberInput = 42;
      const userInput: UserInput = {
        name: "John",
        email: "john@example.com",
        age: 25,
      };

      expect(typeof stringInput).toBe("string");
      expect(typeof numberInput).toBe("number");
      expect(typeof userInput).toBe("object");
    });

    it("should infer unknown for handlers without input schema", () => {
      const noInputAction = craft((action) =>
        action.handler(async () => "no input"),
      );

      type NoInputType = InferInput<typeof noInputAction>;

      // Should be unknown
      const input: NoInputType = "anything";
      expect(input).toBe("anything");
    });
  });
  describe("Result type inference", () => {
    it("should infer correct result types for api format", () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            customError: (message: string) =>
              ({
                type: "CUSTOM_ERROR" as const,
                message,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input === "error") {
              return errors.customError("Test error");
            }
            return { processed: input.toUpperCase() };
          }),
      );

      type ActionResult = InferResult<typeof action>;

      // Type should be a ApiResult with success/data or success/error
      const successResult: ActionResult = {
        success: true,
        data: { processed: "TEST" },
        __ac_id: "test-action-id",
      };

      const errorResult: ActionResult = {
        success: false,
        error: { type: "CUSTOM_ERROR", message: "Test error" },
        __ac_id: "test-action-id",
      };

      expect(successResult.success).toBe(true);
      expect(errorResult.success).toBe(false);
    });

    it("should infer correct result types for functional format", () => {
      const action = craft((action) =>
        action
          .config({
            resultFormat: "functional",
          })
          .schemas({ inputSchema: numberSchema })
          .errors({
            negative: (value: number) =>
              ({
                type: "NEGATIVE_ERROR" as const,
                value,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input < 0) {
              return errors.negative(input);
            }
            return Math.sqrt(input);
          }),
      );

      type ActionResult = InferResult<typeof action>;

      // Type should be a Result with type: "ok" | "err"
      const successResult: ActionResult = {
        type: "ok",
        value: 4.0,
        __ac_id: "test-action-id",
      };

      const errorResult: ActionResult = {
        type: "err",
        error: { type: "NEGATIVE_ERROR", value: -1 },
        __ac_id: "test-action-id",
      };

      expect(successResult.type).toBe("ok");
      expect(errorResult.type).toBe("err");
    });
  });
  describe("Data type inference", () => {
    it("should infer correct data types from handler implementations", () => {
      const simpleAction = craft((action) =>
        action.handler(async () => "simple string"),
      );

      const complexAction = craft((action) =>
        action
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => ({
            user: input,
            timestamp: Date.now(),
            metadata: { processed: true, version: 1 },
          })),
      );

      type SimpleData = InferData<typeof simpleAction>;
      type ComplexData = InferData<typeof complexAction>;

      // These should compile without errors if types are correctly inferred
      const simpleData: SimpleData = "simple string";
      const complexData: ComplexData = {
        user: { name: "John", email: "john@example.com", age: 25 },
        timestamp: 1234567890,
        metadata: { processed: true, version: 1 },
      };

      expect(typeof simpleData).toBe("string");
      expect(typeof complexData).toBe("object");
      expect(complexData.metadata.processed).toBe(true);
    });

    it("should handle union return types", () => {
      const unionAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input.startsWith("num:")) {
              return parseInt(input.slice(4), 10) as string | number;
            }
            return input.toUpperCase() as string | number;
          }),
      );

      type UnionData = InferData<typeof unionAction>;

      // Should be string | number
      const stringData: UnionData = "TEST";
      const numberData: UnionData = 42;

      expect(typeof stringData).toBe("string");
      expect(typeof numberData).toBe("number");
    });
  });
  describe("Error type inference", () => {
    it("should infer all possible error types", () => {
      const multiErrorAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            validation: (field: string, value: unknown) =>
              ({
                type: "VALIDATION_ERROR" as const,
                field,
                value,
              }) as const,
            notFound: (id: string) =>
              ({
                type: "NOT_FOUND" as const,
                id,
                message: "Resource not found",
              }) as const,
            unauthorized: () =>
              ({
                type: "UNAUTHORIZED" as const,
                code: 401,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input === "invalid") {
              return errors.validation("input", input);
            }
            if (input === "missing") {
              return errors.notFound(input);
            }
            if (input === "forbidden") {
              return errors.unauthorized();
            }
            return input;
          }),
      );

      type ErrorTypes = InferErrors<typeof multiErrorAction>;

      // Should include custom errors, validation errors, and unhandled errors
      const validationError: ErrorTypes = {
        type: "VALIDATION_ERROR",
        field: "input",
        value: "test",
      };

      const notFoundError: ErrorTypes = {
        type: "NOT_FOUND",
        id: "123",
        message: "Resource not found",
      };

      const unauthorizedError: ErrorTypes = {
        type: "UNAUTHORIZED",
        code: 401,
      };

      const inputValidationError: ErrorTypes = {
        type: "INPUT_VALIDATION",
        message: "Input validation failed",
        issues: [],
      };

      const unhandledError: ErrorTypes = {
        type: "UNHANDLED",
        message: "An unhandled error occurred",
      };

      expect(validationError.type).toBe("VALIDATION_ERROR");
      expect(notFoundError.type).toBe("NOT_FOUND");
      expect(unauthorizedError.type).toBe("UNAUTHORIZED");
      expect(inputValidationError.type).toBe("INPUT_VALIDATION");
      expect(unhandledError.type).toBe("UNHANDLED");
    });
    it("should infer validation error formats correctly", () => {
      const nestedErrorAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      const flattenedErrorAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      type NestedErrorTypes = InferErrors<typeof nestedErrorAction>;
      type FlattenedErrorTypes = InferErrors<typeof flattenedErrorAction>;

      // Nested format should have formErrors and fieldErrors
      const nestedError: NestedErrorTypes = {
        type: "INPUT_VALIDATION",
        message: "Input validation failed",
        formErrors: ["Error message"],
        fieldErrors: { field: ["Field error"] },
      };

      // Flattened format should have issues array
      const flattenedError: FlattenedErrorTypes = {
        type: "INPUT_VALIDATION",
        message: "Input validation failed",
        issues: [{ path: [], message: "Error message" }],
      };

      expect(nestedError.type).toBe("INPUT_VALIDATION");
      expect(flattenedError.type).toBe("INPUT_VALIDATION");
    });
  });
  describe("Complex action chain inference", () => {
    it("should maintain type safety through entire fluent chain", () => {
      const complexAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
            resultFormat: "api",
          })
          .schemas({
            inputSchema: userSchema,
            outputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .errors({
            businessLogic: (code: number, message: string) =>
              ({
                type: "BUSINESS_LOGIC_ERROR" as const,
                code,
                message,
                timestamp: Date.now(),
              }) as const,
          })
          .handler(async ({ input, bindArgs, errors }) => {
            const [multiplier] = bindArgs;

            if (input.age * multiplier > 1000) {
              return errors.businessLogic(
                400,
                "Age multiplier result too large",
              );
            }

            return `${input.name} (age: ${input.age * multiplier})`;
          })
          .callbacks({
            onSuccess: ({ data, metadata }) => {
              // These types should be correctly inferred
              expect(typeof data).toBe("string");
              expect(metadata.validatedInput?.name).toBeDefined();
              expect(metadata.validatedBindArgs?.[0]).toBeTypeOf("number");
            },
            onError: ({ error, metadata }) => {
              // Error types should be correctly inferred
              expect(error.type).toMatch(
                /BUSINESS_LOGIC_ERROR|INPUT_VALIDATION|BIND_ARGS_VALIDATION|UNHANDLED/,
              );
              expect(metadata.rawInput).toBeDefined();
            },
          }),
      );

      // All types should be correctly inferred
      type Input = InferInput<typeof complexAction>;
      type Result = InferResult<typeof complexAction>;
      type Data = InferData<typeof complexAction>;
      type Errors = InferErrors<typeof complexAction>;

      const input: Input = {
        name: "John",
        email: "john@example.com",
        age: 25,
      };

      const successResult: Result = {
        success: true,
        data: "John (age: 50)",
        __ac_id: "test-action-id",
      };

      const errorResult: Result = {
        success: false,
        error: {
          type: "BUSINESS_LOGIC_ERROR",
          code: 400,
          message: "Age multiplier result too large",
          timestamp: 1234567890,
        },
        __ac_id: "test-action-id",
      };

      const data: Data = "John (age: 50)";

      const businessError: Errors = {
        type: "BUSINESS_LOGIC_ERROR",
        code: 400,
        message: "Error",
        timestamp: 1234567890,
      };

      expect(input.name).toBe("John");
      expect(successResult.success).toBe(true);
      expect(errorResult.success).toBe(false);
      expect(typeof data).toBe("string");
      expect(businessError.type).toBe("BUSINESS_LOGIC_ERROR");
    });
    it("should handle useActionState type inference", () => {
      const actionStateAction = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .errors({
            stateError: (step: string) =>
              ({
                type: "STATE_ERROR" as const,
                step,
              }) as const,
          })
          .handler(async ({ input, bindArgs, metadata, errors }) => {
            const [count] = bindArgs;

            // Previous state should be correctly typed
            if (metadata.prevState?.success) {
              const prevData = metadata.prevState.data;
              expect(typeof prevData).toBe("string");
            }

            if (count > 10) {
              return errors.stateError("validation");
            }

            return input.repeat(count);
          }),
      );

      type ActionResult = InferResult<typeof actionStateAction>;

      // InferResult for useActionState should be a StatefulApiResult (Api-style with optional values)
      const result: ActionResult = {
        success: true,
        data: "testtest",
        __ac_id: "test-action-id",
      };

      expect(result.success).toBe(true);
    });

    it("should infer StatefulApiResult with values for useActionState", () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input.toUpperCase()),
      );

      type Res = InferResult<typeof action>;

      // Result should allow optional values field
      const resultWithValues: Res = {
        success: true,
        data: "HELLO",
        values: "HELLO",
        __ac_id: "test-action-id",
      };

      expect(resultWithValues.values).toBe("HELLO");
    });
    it("should infer StatefulApiResult even when resultFormat is functional", () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            resultFormat: "functional",
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      type Res = InferResult<typeof action>;

      const result: Res = {
        success: true,
        data: "test",
        values: "test",
        __ac_id: "test-action-id",
      };

      expect(result.success).toBe(true);
      expect(result.values).toBe("test");
    });
  });
  describe("$Infer pattern", () => {
    it("should provide equivalent types to traditional inference utilities", () => {
      const testAction = craft((action) =>
        action
          .schemas({ inputSchema: userSchema })
          .errors({
            customError: (message: string) =>
              ({
                type: "CUSTOM_ERROR" as const,
                message,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input.age < 0) {
              return errors.customError("Invalid age");
            }
            return { processedUser: input, timestamp: Date.now() };
          }),
      );

      // Traditional approach
      type TraditionalInput = InferInput<typeof testAction>;
      type TraditionalResult = InferResult<typeof testAction>;
      type TraditionalData = InferData<typeof testAction>;
      type TraditionalErrors = InferErrors<typeof testAction>;

      // New $Infer approach
      type DollarInferInput = typeof testAction.$Infer.Input;
      type DollarInferResult = typeof testAction.$Infer.Result;
      type DollarInferData = typeof testAction.$Infer.Data;
      type DollarInferErrors = typeof testAction.$Infer.Errors;

      // These should be identical types - test by assignment
      const input1: TraditionalInput = {
        name: "John",
        email: "john@example.com",
        age: 25,
      };
      const input2: DollarInferInput = input1; // Should compile without error
      const input3: TraditionalInput = input2; // Should compile without error

      const result1: TraditionalResult = {
        success: true,
        data: { processedUser: input1, timestamp: 1234567890 },
        __ac_id: "test-action-id",
      };
      const result2: DollarInferResult = result1; // Should compile without error
      const result3: TraditionalResult = result2; // Should compile without error

      const data1: TraditionalData = {
        processedUser: input1,
        timestamp: 1234567890,
      };
      const data2: DollarInferData = data1; // Should compile without error
      const data3: TraditionalData = data2; // Should compile without error

      const error1: TraditionalErrors = {
        type: "CUSTOM_ERROR",
        message: "Invalid age",
      };
      const error2: DollarInferErrors = error1; // Should compile without error
      const error3: TraditionalErrors = error2; // Should compile without error

      // Runtime checks to ensure the values work as expected
      expect(input2.name).toBe("John");
      expect(result2.success).toBe(true);
      expect(data2.timestamp).toBe(1234567890);
      expect(error2.type).toBe("CUSTOM_ERROR");
    });

    it("should work with all configuration variants", () => {
      // Test functional result format
      const functionalAction = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input.toUpperCase()),
      );

      type FunctionalResult = typeof functionalAction.$Infer.Result;
      const functionalResult: FunctionalResult = {
        type: "ok",
        value: "TEST",
        __ac_id: "test-action-id",
      };
      expect(functionalResult.type).toBe("ok");

      // Test useActionState
      const stateAction = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => input * 2),
      );

      type StateResult = typeof stateAction.$Infer.Result;
      const stateResult: StateResult = {
        success: true,
        data: 42,
        values: 42,
        __ac_id: "test-action-id",
      };
      expect(stateResult.success).toBe(true);

      // Test nested validation error format
      const nestedValidationAction = craft((action) =>
        action
          .config({ validationErrorFormat: "nested" })
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => input),
      );

      type NestedErrors = typeof nestedValidationAction.$Infer.Errors;
      const nestedError: NestedErrors = {
        type: "INPUT_VALIDATION",
        message: "Input validation failed",
        formErrors: ["Error message"],
        fieldErrors: { name: ["Name is required"] },
      };
      expect(nestedError.type).toBe("INPUT_VALIDATION");
    });
    it("should work with complex action chains", () => {
      const complexAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
            resultFormat: "api",
          })
          .schemas({
            inputSchema: userSchema,
            bindSchemas: [stringSchema, numberSchema] as const,
          })
          .errors({
            businessError: (code: number) =>
              ({
                type: "BUSINESS_ERROR" as const,
                code,
                details: { timestamp: Date.now() },
              }) as const,
            validationError: (field: string) =>
              ({
                type: "FIELD_VALIDATION" as const,
                field,
              }) as const,
          })
          .handler(async ({ input, bindArgs, errors }) => {
            const [prefix, multiplier] = bindArgs;

            if (input.age * multiplier > 200) {
              return errors.businessError(400);
            }

            return {
              result: `${prefix}: ${input.name}`,
              calculatedAge: input.age * multiplier,
              metadata: { processed: true },
            };
          }),
      );

      // All $Infer types should work correctly
      type ComplexInput = typeof complexAction.$Infer.Input;
      type ComplexResult = typeof complexAction.$Infer.Result;
      type ComplexData = typeof complexAction.$Infer.Data;
      type ComplexErrors = typeof complexAction.$Infer.Errors;

      const input: ComplexInput = {
        name: "Alice",
        email: "alice@example.com",
        age: 30,
      };

      const result: ComplexResult = {
        success: true,
        data: {
          result: "Hello: Alice",
          calculatedAge: 60,
          metadata: { processed: true },
        },
        __ac_id: "test-action-id",
      };

      const data: ComplexData = {
        result: "Hello: Alice",
        calculatedAge: 60,
        metadata: { processed: true },
      };

      const businessError: ComplexErrors = {
        type: "BUSINESS_ERROR",
        code: 400,
        details: { timestamp: 1234567890 },
      };

      const validationError: ComplexErrors = {
        type: "INPUT_VALIDATION",
        message: "Input validation failed",
        issues: [{ path: ["name"], message: "Name is required" }],
      };

      expect(input.name).toBe("Alice");
      expect(result.success).toBe(true);
      expect(data.metadata.processed).toBe(true);
      expect(businessError.type).toBe("BUSINESS_ERROR");
      expect(validationError.type).toBe("INPUT_VALIDATION");
    });
    it("should maintain type safety with no schemas", () => {
      const noSchemaAction = craft((action) =>
        action.handler(async () => "simple result"),
      );

      type NoSchemaInput = typeof noSchemaAction.$Infer.Input;
      type NoSchemaData = typeof noSchemaAction.$Infer.Data;
      type NoSchemaErrors = typeof noSchemaAction.$Infer.Errors;

      // Input should be unknown when no schema is provided
      const input: NoSchemaInput = "anything";
      const data: NoSchemaData = "simple result";
      const error: NoSchemaErrors = {
        type: "UNHANDLED",
        message: "An unhandled error occurred",
      };

      expect(input).toBe("anything");
      expect(data).toBe("simple result");
      expect(error.type).toBe("UNHANDLED");
    });

    it("should work with bind schemas", () => {
      const bindAction = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema, userSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [count, user] = bindArgs;
            return {
              message: input.repeat(count),
              user: user.name,
            };
          }),
      );

      type BindData = typeof bindAction.$Infer.Data;
      const data: BindData = {
        message: "hellohello",
        user: "John",
      };

      expect(data.message).toBe("hellohello");
      expect(data.user).toBe("John");
    });
  });
  describe("Type inference edge cases", () => {
    it("should handle optional schemas correctly", () => {
      const optionalOutputAction = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            // outputSchema is optional
          })
          .handler(async ({ input }) => input.length),
      );

      type Data = InferData<typeof optionalOutputAction>;
      const data: Data = 42;

      expect(typeof data).toBe("number");
    });

    it("should handle empty error definitions", () => {
      const noErrorsAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      type Errors = InferErrors<typeof noErrorsAction>;

      // Should still include built-in error types
      const validationError: Errors = {
        type: "INPUT_VALIDATION",
        message: "Input validation failed",
        issues: [],
      };

      const unhandledError: Errors = {
        type: "UNHANDLED",
        message: "An unhandled error occurred",
      };

      expect(validationError.type).toBe("INPUT_VALIDATION");
      expect(unhandledError.type).toBe("UNHANDLED");
    });

    it("should handle deeply nested return types", () => {
      const deepNestedAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => ({
            level1: {
              level2: {
                level3: {
                  level4: {
                    value: input,
                    metadata: {
                      processed: true,
                      timestamp: Date.now(),
                    },
                  },
                },
              },
            },
          })),
      );

      type DeepData = InferData<typeof deepNestedAction>;

      const deepData: DeepData = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "test",
                metadata: {
                  processed: true,
                  timestamp: 1234567890,
                },
              },
            },
          },
        },
      };

      expect(deepData.level1.level2.level3.level4.value).toBe("test");
      expect(deepData.level1.level2.level3.level4.metadata.processed).toBe(
        true,
      );
    });
  });
});
