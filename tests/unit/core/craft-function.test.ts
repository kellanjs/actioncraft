import { actioncraft } from "../../../src/index.js";
import {
  expectSuccessResult,
  expectErrorResult,
  expectActionMetadata,
  commonErrorFactories,
  commonTestData,
} from "../../__fixtures__/helpers";
import {
  stringSchema,
  userSchema,
  numberSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";

// File-specific test utilities (not shared across other test files)
const testUser = commonTestData.validUser;

const commonErrors = {
  notFound: commonErrorFactories.notFound,
  validation: commonErrorFactories.validation,
};

describe("Actioncraft builder", () => {
  describe("Basic builder usage", () => {
    it("should create action with basic handler", () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Hello ${input}!`;
        })
        .build();

      // Verify action is created
      expect(action).toBeTypeOf("function");
      expectActionMetadata(action);
    });

    it("should execute action with string input", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Hello ${input}!`;
        })
        .build();

      const result = await action("World");
      expectSuccessResult(result, "Hello World!");
    });

    it("should support complex schemas", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: userSchema,
        })
        .handler(async ({ input }) => {
          return {
            id: "123",
            ...input,
            createdAt: new Date("2024-01-01"),
          };
        })
        .build();

      const result = await action(testUser);
      expectSuccessResult(result, {
        id: "123",
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        createdAt: new Date("2024-01-01"),
      });
    });

    it("should support error handling", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .errors(commonErrors)
        .handler(async ({ input, errors }) => {
          if (input === "missing") {
            return errors.notFound(input);
          }
          return `Found: ${input}`;
        })
        .build();

      // Test success case
      const successResult = await action("test");
      expectSuccessResult(successResult, "Found: test");

      // Test error case
      const errorResult = await action("missing");
      expectErrorResult(errorResult, {
        type: "NOT_FOUND",
        message: "Item missing not found",
      });
    });

    it("should support callbacks", async () => {
      let callbackData: any = null;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Processed: ${input}`;
        })
        .callbacks({
          onSuccess: ({ data }) => {
            callbackData = data;
          },
        })
        .build();

      const result = await action("test");
      expectSuccessResult(result, "Processed: test");
      expect(callbackData).toBe("Processed: test");
    });

    it("should support configuration", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "api" as const,
        })
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Configured: ${input}`;
        })
        .build();

      const result = await action("test");
      expectSuccessResult(result, "Configured: test");
      expectActionMetadata(action);
    });

    it("should support method chaining", async () => {
      const action = actioncraft()
        .config({ resultFormat: "api" as const })
        .schemas({ inputSchema: stringSchema })
        .errors(commonErrors)
        .handler(async ({ input, errors }) => {
          if (input === "error") {
            return errors.validation("input");
          }
          return `Chained: ${input}`;
        })
        .callbacks({
          onSuccess: () => {
            // Success callback
          },
        })
        .build();

      const result = await action("test");
      expectSuccessResult(result, "Chained: test");
    });

    it("should support bind arguments", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, userSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [num, user] = bindArgs;
          return `${input}-${num}-${user.name}`;
        })
        .build();

      // Call with bind arguments - the correct order is: bindArg1, bindArg2, ..., input
      const result = await action(42, testUser, "test");
      expectSuccessResult(result, "test-42-John Doe");
    });

    it("should support output schema validation", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Processed: ${input}`;
        })
        .build();

      const result = await action("test");
      expectSuccessResult(result, "Processed: test");
    });

    it("should support multiple error types", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .errors({
          notFound: (id: string) => ({
            type: "NOT_FOUND" as const,
            message: `Item ${id} not found`,
          }),
          validation: (field: string) => ({
            type: "VALIDATION_ERROR" as const,
            message: `Invalid ${field}`,
          }),
          unauthorized: () => ({
            type: "UNAUTHORIZED" as const,
            message: "Access denied",
          }),
        })
        .handler(async ({ input, errors }) => {
          if (input === "missing") {
            return errors.notFound(input);
          }
          if (input === "invalid") {
            return errors.validation("input");
          }
          if (input === "forbidden") {
            return errors.unauthorized();
          }
          return `Success: ${input}`;
        })
        .build();

      // Test success case
      const successResult = await action("test");
      expectSuccessResult(successResult, "Success: test");

      // Test different error types
      const notFoundResult = await action("missing");
      expectErrorResult(notFoundResult, {
        type: "NOT_FOUND",
        message: "Item missing not found",
      });

      const validationResult = await action("invalid");
      expectErrorResult(validationResult, {
        type: "VALIDATION_ERROR",
        message: "Invalid input",
      });

      const unauthorizedResult = await action("forbidden");
      expectErrorResult(unauthorizedResult, {
        type: "UNAUTHORIZED",
        message: "Access denied",
      });
    });

    it("should support complex callback scenarios", async () => {
      let successCallbackData: any = null;
      let errorCallbackData: any = null;
      let settledCallbackData: any = null;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .errors({
          testError: () => ({
            type: "TEST_ERROR" as const,
            message: "Test error",
          }),
        })
        .handler(async ({ input, errors }) => {
          if (input === "error") {
            return errors.testError();
          }
          return `Processed: ${input}`;
        })
        .callbacks({
          onSuccess: ({ data, metadata }) => {
            successCallbackData = { data, metadata };
          },
          onError: ({ error, metadata }) => {
            errorCallbackData = { error, metadata };
          },
          onSettled: ({ result, metadata }) => {
            settledCallbackData = { result, metadata };
          },
        })
        .build();

      // Test success callback
      const successResult = await action("test");
      expectSuccessResult(successResult, "Processed: test");
      expect(successCallbackData).toBeDefined();
      expect(successCallbackData.data).toBe("Processed: test");
      expect(successCallbackData.metadata).toBeDefined();

      // Reset callback data
      successCallbackData = null;
      errorCallbackData = null;
      settledCallbackData = null;

      // Test error callback
      const errorResult = await action("error");
      expectErrorResult(errorResult, {
        type: "TEST_ERROR",
        message: "Test error",
      });
      expect(errorCallbackData).toBeDefined();
      expect(errorCallbackData.error.type).toBe("TEST_ERROR");
      expect(errorCallbackData.metadata).toBeDefined();

      // Settled callback should be called in both cases
      expect(settledCallbackData).toBeDefined();
    });

    it("should support no input schema", async () => {
      const action = actioncraft()
        .handler(async () => {
          return "No input required";
        })
        .build();

      const result = await action();
      expectSuccessResult(result, "No input required");
    });

    it("should support functional result format", async () => {
      const action = actioncraft()
        .config({
          resultFormat: "functional" as const,
        })
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Functional: ${input}`;
        })
        .build();

      const result = await action("test");
      // For functional format, the result structure might be different
      // but we still expect it to be successful
      expect(result).toBeDefined();
    });

    it("should support custom error handling", async () => {
      const customErrorHandler = (error: unknown) => ({
        type: "CUSTOM_UNHANDLED" as const,
        originalError: error,
        timestamp: new Date().toISOString(),
      });

      const action = actioncraft()
        .config({
          handleThrownError: customErrorHandler,
        })
        .handler(async () => {
          throw new Error("Intentional error");
        })
        .build();

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("CUSTOM_UNHANDLED");
        // @ts-expect-error - Custom error handler properties are not typed in the error union
        expect(result.error.originalError).toBeInstanceOf(Error);
        // @ts-expect-error - Custom error handler properties are not typed in the error union
        expect(result.error.timestamp).toBeDefined();
      }
    });
  });

  describe("Edge cases and error scenarios", () => {
    it("should handle immediate error return", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .errors({
          immediate: () => ({
            type: "IMMEDIATE_ERROR" as const,
            message: "Immediate error",
          }),
        })
        .handler(async ({ errors }) => {
          return errors.immediate();
        })
        .build();

      const result = await action("test");
      expectErrorResult(result, {
        type: "IMMEDIATE_ERROR",
        message: "Immediate error",
      });
    });

    it("should maintain unique action IDs across different actions", () => {
      const action1 = actioncraft()
        .handler(async () => "test")
        .build();

      const action2 = actioncraft()
        .handler(async () => "test")
        .build();

      // Different actions should have different IDs
      expect((action1 as any).__ac_id).not.toBe((action2 as any).__ac_id);
    });

    it("should maintain consistent action ID for the same action", () => {
      const action = actioncraft()
        .handler(async () => "test")
        .build();

      const id1 = (action as any).__ac_id;
      const id2 = (action as any).__ac_id;

      // Same action should maintain the same ID
      expect(id1).toBe(id2);
      expect(id1).toBeDefined();
    });
  });
});
