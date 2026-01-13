import { actioncraft, initial } from "../../../src/index.js";
import {
  stringSchema,
  numberSchema,
  userSchema,
  organizationIdSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";

describe("Advanced Result Format Testing", () => {
  describe("Web Format (Default) - Deep Testing", () => {
    it("should return consistent api format for success scenarios", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => ({
          processedInput: (input as string).toUpperCase(),
          length: (input as string).length,
          metadata: { processed: true },
        }))
        .build();

      const result = await action("test");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.processedInput).toBe("TEST");
        expect(result.data.length).toBe(4);
        expect(result.data.metadata.processed).toBe(true);
        expect("error" in result).toBe(false);
      }
    });

    it("should return consistent api format for error scenarios", async () => {
      const action = actioncraft()
        .errors({
          businessError: (code: number, message: string) =>
            ({
              type: "BUSINESS_ERROR",
              code,
              message,
            }) as const,
        })
        .handler(async ({ errors }) => errors.businessError(404, "Not found"))
        .build();

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BUSINESS_ERROR");
        expect("data" in result).toBe(false);
      }
    });

    it("should handle validation errors in api format", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => input)
        .build();

      // @ts-expect-error - Testing invalid input type
      const result = await action(123);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Functional Format - Deep Testing", () => {
    it("should return consistent functional format for success scenarios", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => ({
          doubled: (input as number) * 2,
          isEven: (input as number) % 2 === 0,
          formatted: `Number: ${input}`,
        }))
        .build();

      const result = await action(21);

      expect("success" in result).toBe(false); // Functional format doesn't have success prop
      expect("value" in result).toBe(true);
      expect("error" in result).toBe(false);

      if ("value" in result) {
        const value = result.value as {
          doubled: number;
          isEven: boolean;
          formatted: string;
        };
        expect(value.doubled).toBe(42);
        expect(value.isEven).toBe(false);
        expect(value.formatted).toBe("Number: 21");
      }
    });

    it("should return consistent functional format for error scenarios", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .errors({
          notFound: (resource: string) =>
            ({
              type: "NOT_FOUND",
              resource,
              timestamp: Date.now(),
            }) as const,
        })
        .handler(async ({ errors }) => errors.notFound("user"))
        .build();

      const result = await action();
      expect("error" in result).toBe(true);
      expect("value" in result).toBe(false);

      if ("error" in result) {
        expect(result.error.type).toBe("NOT_FOUND");
      }
    });

    it("should handle validation errors in functional format", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => input)
        .build();

      // @ts-expect-error - Testing invalid input type
      const result = await action(123);
      expect("error" in result).toBe(true);
      expect("value" in result).toBe(false);

      if ("error" in result) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should set type discriminator to 'ok' for successful functional results", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .handler(async () => {
          return "success";
        })
        .build();

      const result = await action();

      expect(result.type).toBe("ok");
      expect("value" in result).toBe(true);
      expect("error" in result).toBe(false);
    });

    it("should set type discriminator to 'err' for error functional results", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .errors({
          failure: () => ({ type: "FAILURE" }) as const,
        })
        .handler(async ({ errors }) => errors.failure())
        .build();

      const result = await action();

      expect(result.type).toBe("err");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.type).toBe("FAILURE");
      }
    });
  });

  describe("Format Consistency Validation", () => {
    it("should produce equivalent data in both formats for success cases", async () => {
      const testData = {
        message: "consistency test",
        value: 42,
        nested: { prop: "nested value" },
      };

      // Web format action
      const apiAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => ({ ...testData, input }))
        .build();

      // Functional format action (same logic)
      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => ({ ...testData, input }))
        .build();

      const apiResult = await apiAction("test input");
      const functionalResult = await functionalAction("test input");

      // Both should be successful
      expect(apiResult.success).toBe(true);
      expect("value" in functionalResult).toBe(true);

      // Data should be equivalent
      if (apiResult.success && "value" in functionalResult) {
        expect(apiResult.data).toEqual(functionalResult.value);
      }
    });

    it("should produce equivalent errors in both formats", async () => {
      const customErrors = {
        validationFailed: (field: string, value: unknown) =>
          ({
            type: "VALIDATION_FAILED",
            field,
            value,
            message: `Validation failed for ${field}`,
          }) as const,
      };

      // Web format action
      const apiAction = actioncraft()
        .errors(customErrors)
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input, errors }) => {
          if ((input as string).length < 3) {
            return errors.validationFailed("input", input);
          }
          return input;
        })
        .build();

      // Functional format action (same logic)
      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .errors(customErrors)
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input, errors }) => {
          if ((input as string).length < 3) {
            return errors.validationFailed("input", input);
          }
          return input;
        })
        .build();

      const apiResult = await apiAction("ab"); // Too short
      const functionalResult = await functionalAction("ab"); // Too short

      // Both should be errors
      expect(apiResult.success).toBe(false);
      expect("error" in functionalResult).toBe(true);

      // Errors should be equivalent
      if (!apiResult.success && "error" in functionalResult) {
        expect(apiResult.error).toEqual(functionalResult.error);
        expect(apiResult.error.type).toBe("VALIDATION_FAILED");
      }
    });

    it("should handle built-in validation errors consistently across formats", async () => {
      const apiAction = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      // Test with invalid input
      const invalidInput = { name: "", email: "invalid", age: 15 }; // Multiple validation errors

      const apiResult = await apiAction(invalidInput);
      const functionalResult = await functionalAction(invalidInput);

      expect(apiResult.success).toBe(false);
      expect("error" in functionalResult).toBe(true);

      if (!apiResult.success && "error" in functionalResult) {
        expect(apiResult.error.type).toBe(functionalResult.error.type);
        expect(apiResult.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Type Inference Verification", () => {
    it("should properly infer success data types in api format", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => ({
          processedInput: (input as string).toUpperCase(),
          length: (input as string).length,
          metadata: { processed: true },
        }))
        .build();

      const result = await action("test");

      if (result.success) {
        // These should be properly typed without type assertions
        const processedInput: string = result.data.processedInput;
        const length: number = result.data.length;
        const processed: boolean = result.data.metadata.processed;

        expect(processedInput).toBe("TEST");
        expect(length).toBe(4);
        expect(processed).toBe(true);
      }
    });

    it("should properly infer error types in both formats", async () => {
      const customErrors = {
        businessLogicError: (code: number, details: string[]) =>
          ({
            type: "BUSINESS_LOGIC_ERROR",
            code,
            details,
            timestamp: Date.now(),
          }) as const,
      };

      // Web format
      const apiAction = actioncraft()
        .errors(customErrors)
        .handler(async ({ errors }) =>
          errors.businessLogicError(400, ["Invalid request", "Missing data"]),
        )
        .build();

      // Functional format
      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .errors(customErrors)
        .handler(async ({ errors }) =>
          errors.businessLogicError(500, ["Server error", "Database down"]),
        )
        .build();

      const apiResult = await apiAction();
      const functionalResult = await functionalAction();

      if (!apiResult.success) {
        // Error type should be properly inferred
        if (apiResult.error.type === "BUSINESS_LOGIC_ERROR") {
          const error = apiResult.error as {
            type: "BUSINESS_LOGIC_ERROR";
            code: number;
            details: string[];
            timestamp: number;
          };
          expect(error.code).toBe(400);
          expect(error.details).toEqual(["Invalid request", "Missing data"]);
        }
      }

      if ("error" in functionalResult) {
        // Error type should be properly inferred
        if (functionalResult.error.type === "BUSINESS_LOGIC_ERROR") {
          const error = functionalResult.error as {
            type: "BUSINESS_LOGIC_ERROR";
            code: number;
            details: string[];
            timestamp: number;
          };
          expect(error.code).toBe(500);
          expect(error.details).toEqual(["Server error", "Database down"]);
        }
      }
    });

    it("should handle complex bind args scenarios in both formats", async () => {
      // Web format with bind args
      const apiAction = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [organizationIdSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [orgId] = bindArgs;
          return {
            input: input as string,
            organizationId: orgId as string,
            processed: true,
          };
        })
        .build();

      // Functional format with bind args
      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({
          inputSchema: numberSchema,
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [prefix] = bindArgs;
          return {
            result: `${prefix as string}: ${input as number}`,
            doubled: (input as number) * 2,
          };
        })
        .build();

      const apiResult = await apiAction(
        "550e8400-e29b-41d4-a716-446655440000",
        "test input",
      );

      const functionalResult = await functionalAction("prefix-text", 42);

      expect(apiResult.success).toBe(true);
      expect("value" in functionalResult).toBe(true);

      if (apiResult.success) {
        expect(apiResult.data.input).toBe("test input");
        expect(apiResult.data.organizationId).toBe(
          "550e8400-e29b-41d4-a716-446655440000",
        );
        expect(apiResult.data.processed).toBe(true);
      }

      if ("value" in functionalResult) {
        const value = functionalResult.value as {
          result: string;
          doubled: number;
        };
        expect(value.result).toBe("prefix-text: 42");
        expect(value.doubled).toBe(84);
      }
    });
  });

  describe("Action ID Consistency Across Formats", () => {
    it("should include action ID in all result formats", async () => {
      // API format
      const apiAction = actioncraft()
        .handler(async () => ({ data: "api" }))
        .build();

      // Functional format
      const functionalAction = actioncraft()
        .config({ resultFormat: "functional" })
        .handler(async () => ({ data: "functional" }))
        .build();

      // useActionState format
      const stateAction = actioncraft()
        .config({ useActionState: true })
        .handler(async () => ({ data: "state" }))
        .build();

      const apiResult = await apiAction();
      const functionalResult = await functionalAction();
      const stateResult = await stateAction(initial(stateAction));

      // All should have action IDs
      expect(apiResult.__ac_id).toBeDefined();
      expect(functionalResult.__ac_id).toBeDefined();
      expect(stateResult.__ac_id).toBeDefined();

      expect(typeof apiResult.__ac_id).toBe("string");
      expect(typeof functionalResult.__ac_id).toBe("string");
      expect(typeof stateResult.__ac_id).toBe("string");

      // All should be different (different actions)
      expect(apiResult.__ac_id).not.toBe(functionalResult.__ac_id);
      expect(functionalResult.__ac_id).not.toBe(stateResult.__ac_id);
      expect(apiResult.__ac_id).not.toBe(stateResult.__ac_id);
    });

    it("should include action ID in error results across all formats", async () => {
      const errorDef = {
        testError: () => ({ type: "TEST_ERROR" as const }),
      };

      // API format error
      const apiAction = actioncraft()
        .errors(errorDef)
        .handler(async ({ errors }) => errors.testError())
        .build();

      // Functional format error
      const functionalAction = actioncraft()
        .config({ resultFormat: "functional" })
        .errors(errorDef)
        .handler(async ({ errors }) => errors.testError())
        .build();

      // useActionState format error
      const stateAction = actioncraft()
        .config({ useActionState: true })
        .errors(errorDef)
        .handler(async ({ errors }) => errors.testError())
        .build();

      const apiResult = await apiAction();
      const functionalResult = await functionalAction();
      const stateResult = await stateAction(initial(stateAction));

      // All should have action IDs
      expect(apiResult.__ac_id).toBeDefined();
      expect(functionalResult.__ac_id).toBeDefined();
      expect(stateResult.__ac_id).toBeDefined();

      expect(typeof apiResult.__ac_id).toBe("string");
      expect(typeof functionalResult.__ac_id).toBe("string");
      expect(typeof stateResult.__ac_id).toBe("string");

      // All should be errors
      expect(apiResult.success).toBe(false);
      expect(functionalResult.type).toBe("err");
      expect(stateResult.success).toBe(false);
    });

    it("should maintain action ID consistency within same action across multiple calls", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => ({ processed: input }))
        .build();

      const result1 = await action("test1");
      const result2 = await action("test2");
      const result3 = await action("test3");

      expect(result1.__ac_id).toBe(result2.__ac_id);
      expect(result2.__ac_id).toBe(result3.__ac_id);
      expect(result1.__ac_id).toBe(result3.__ac_id);
    });
  });

  describe("Advanced Format Edge Cases", () => {
    it("should handle null/undefined data consistently", async () => {
      const apiAction = actioncraft()
        .handler(async () => null)
        .build();

      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .handler(async () => null)
        .build();

      const apiResult = await apiAction();
      const functionalResult = await functionalAction();

      expect(apiResult.success).toBe(true);
      expect("value" in functionalResult).toBe(true);

      if (apiResult.success && "value" in functionalResult) {
        expect(apiResult.data).toBe(null);
        expect(functionalResult.value).toBe(null);
      }
    });

    it("should handle thrown errors consistently", async () => {
      const sharedLogic = async (input: string) => {
        if (input.startsWith("error:")) {
          throw new Error(`Simulated error: ${input.slice(6)}`);
        }
        return {
          processed: input.toUpperCase(),
          timestamp: Date.now(),
        };
      };

      const apiAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => sharedLogic(input as string))
        .build();

      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => sharedLogic(input as string))
        .build();

      // Test success in both formats
      const apiSuccess = await apiAction("hello world");
      const functionalSuccess = await functionalAction("hello world");

      expect(apiSuccess.success).toBe(true);
      expect("value" in functionalSuccess).toBe(true);

      if (apiSuccess.success && "value" in functionalSuccess) {
        const apiData = apiSuccess.data as {
          processed: string;
          timestamp: number;
        };
        const functionalValue = functionalSuccess.value as {
          processed: string;
          timestamp: number;
        };
        expect(apiData.processed).toBe("HELLO WORLD");
        expect(functionalValue.processed).toBe("HELLO WORLD");
        expect(typeof apiData.timestamp).toBe("number");
        expect(typeof functionalValue.timestamp).toBe("number");
      }

      // Test error in both formats
      const apiError = await apiAction("error:something went wrong");
      const functionalError = await functionalAction(
        "error:something went wrong",
      );

      expect(apiError.success).toBe(false);
      expect("error" in functionalError).toBe(true);

      if (!apiError.success && "error" in functionalError) {
        expect(apiError.error.type).toBe("UNHANDLED");
        expect(functionalError.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle complex nested error structures", async () => {
      const complexErrors = {
        nestedError: (
          category: string,
          details: {
            message: string;
            code: number;
            metadata?: Record<string, unknown>;
          },
        ) =>
          ({
            type: "NESTED_ERROR",
            category,
            details,
            timestamp: Date.now(),
          }) as const,
      };

      const apiAction = actioncraft()
        .errors(complexErrors)
        .handler(async ({ errors }) =>
          errors.nestedError("validation", {
            message: "Complex validation failed",
            code: 1001,
            metadata: {
              field: "email",
              attempted: "invalid@",
              suggestions: ["Add domain", "Check format"],
            },
          }),
        )
        .build();

      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .errors(complexErrors)
        .handler(async ({ errors }) =>
          errors.nestedError("authorization", {
            message: "Insufficient permissions",
            code: 2001,
            metadata: {
              requiredRole: "admin",
              currentRole: "user",
            },
          }),
        )
        .build();

      const apiResult = await apiAction();
      const functionalResult = await functionalAction();

      if (!apiResult.success) {
        expect(apiResult.error.type).toBe("NESTED_ERROR");
        const error = apiResult.error as {
          type: "NESTED_ERROR";
          category: string;
          details: {
            message: string;
            code: number;
            metadata?: Record<string, unknown>;
          };
          timestamp: number;
        };
        expect(error.category).toBe("validation");
        expect(error.details.code).toBe(1001);
      }

      if ("error" in functionalResult) {
        expect(functionalResult.error.type).toBe("NESTED_ERROR");
        const error = functionalResult.error as {
          type: "NESTED_ERROR";
          category: string;
          details: {
            message: string;
            code: number;
            metadata?: Record<string, unknown>;
          };
          timestamp: number;
        };
        expect(error.category).toBe("authorization");
        expect(error.details.code).toBe(2001);
      }
    });
  });
});
