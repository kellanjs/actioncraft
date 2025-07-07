import { create } from "../../src/actioncraft";
import type {
  InferInput,
  InferResult,
  InferData,
  InferErrors,
} from "../../src/types/inference";
import { stringSchema, numberSchema, userSchema } from "../fixtures/schemas";
import { describe, it, expect } from "../setup";

describe("TypeScript Type Inference", () => {
  describe("Input type inference", () => {
    it("should infer correct input types from schemas", () => {
      const stringAction = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      const numberAction = create()
        .schemas({ inputSchema: numberSchema })
        .action(async ({ input }) => input)
        .craft();

      const userAction = create()
        .schemas({ inputSchema: userSchema })
        .action(async ({ input }) => input)
        .craft();

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

    it("should infer unknown for actions without input schema", () => {
      const noInputAction = create()
        .action(async () => "no input")
        .craft();

      type NoInputType = InferInput<typeof noInputAction>;

      // Should be unknown
      const input: NoInputType = "anything";
      expect(input).toBe("anything");
    });
  });

  describe("Result type inference", () => {
    it("should infer correct result types for api format", () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .errors({
          customError: (message: string) =>
            ({
              type: "CUSTOM_ERROR" as const,
              message,
            }) as const,
        })
        .action(async ({ input, errors }) => {
          if (input === "error") {
            return errors.customError("Test error");
          }
          return { processed: input.toUpperCase() };
        })
        .craft();

      type ActionResult = InferResult<typeof action>;

      // Type should be a ApiResult with success/data or success/error
      const successResult: ActionResult = {
        success: true,
        data: { processed: "TEST" },
      };

      const errorResult: ActionResult = {
        success: false,
        error: { type: "CUSTOM_ERROR", message: "Test error" },
      };

      expect(successResult.success).toBe(true);
      expect(errorResult.success).toBe(false);
    });

    it("should infer correct result types for functional format", () => {
      const action = create({
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
        .action(async ({ input, errors }) => {
          if (input < 0) {
            return errors.negative(input);
          }
          return Math.sqrt(input);
        })
        .craft();

      type ActionResult = InferResult<typeof action>;

      // Type should be a Result with type: "ok" | "err"
      const successResult: ActionResult = {
        type: "ok",
        value: 4.0,
      };

      const errorResult: ActionResult = {
        type: "err",
        error: { type: "NEGATIVE_ERROR", value: -1 },
      };

      expect(successResult.type).toBe("ok");
      expect(errorResult.type).toBe("err");
    });
  });

  describe("Data type inference", () => {
    it("should infer correct data types from action implementations", () => {
      const simpleAction = create()
        .action(async () => "simple string")
        .craft();

      const complexAction = create()
        .schemas({ inputSchema: userSchema })
        .action(async ({ input }) => ({
          user: input,
          timestamp: Date.now(),
          metadata: { processed: true, version: 1 },
        }))
        .craft();

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
      const unionAction = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          if (input.startsWith("num:")) {
            return parseInt(input.slice(4), 10) as string | number;
          }
          return input.toUpperCase() as string | number;
        })
        .craft();

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
      const multiErrorAction = create()
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
        .action(async ({ input, errors }) => {
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
        })
        .craft();

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
      const nestedErrorAction = create({
        validationErrorFormat: "nested",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      const flattenedErrorAction = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

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
      const complexAction = create({
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
        .action(async ({ input, bindArgs, errors }) => {
          const [multiplier] = bindArgs;

          if (input.age * multiplier > 1000) {
            return errors.businessLogic(400, "Age multiplier result too large");
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
        })
        .craft();

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
      };

      const errorResult: Result = {
        success: false,
        error: {
          type: "BUSINESS_LOGIC_ERROR",
          code: 400,
          message: "Age multiplier result too large",
          timestamp: 1234567890,
        },
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
      const actionStateAction = create({
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
        .action(async ({ input, bindArgs, metadata, errors }) => {
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
        })
        .craft();

      type ActionResult = InferResult<typeof actionStateAction>;

      // InferResult for useActionState should be a StatefulApiResult (Api-style with optional values)
      const result: ActionResult = {
        success: true,
        data: "testtest",
      };

      expect(result.success).toBe(true);
    });

    it("should infer StatefulApiResult with values for useActionState", () => {
      const action = create({
        useActionState: true,
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input.toUpperCase())
        .craft();

      type Res = InferResult<typeof action>;

      // Result should allow optional values field
      const resultWithValues: Res = {
        success: true,
        data: "HELLO",
        values: "HELLO",
      };

      expect(resultWithValues.values).toBe("HELLO");
    });

    it("should infer StatefulApiResult even when resultFormat is functional", () => {
      const action = create({
        useActionState: true,
        resultFormat: "functional",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      type Res = InferResult<typeof action>;

      const result: Res = {
        success: true,
        data: "test",
        values: "test",
      };

      expect(result.success).toBe(true);
      expect(result.values).toBe("test");
    });
  });

  describe("Type inference edge cases", () => {
    it("should handle optional schemas correctly", () => {
      const optionalOutputAction = create()
        .schemas({
          inputSchema: stringSchema,
          // outputSchema is optional
        })
        .action(async ({ input }) => input.length)
        .craft();

      type Data = InferData<typeof optionalOutputAction>;
      const data: Data = 42;

      expect(typeof data).toBe("number");
    });

    it("should handle empty error definitions", () => {
      const noErrorsAction = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

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
      const deepNestedAction = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => ({
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
        }))
        .craft();

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
