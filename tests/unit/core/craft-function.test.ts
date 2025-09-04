import { craft } from "../../../src/index.js";
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

describe("Craft function", () => {
  describe("Synchronous craft functions", () => {
    it("should support synchronous builder functions with basic handler", () => {
      const action = craft((action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
          })
          .handler(async ({ input }) => {
            return `Hello ${input}!`;
          });
      });

      // Verify action is created synchronously
      expect(action).toBeTypeOf("function");
      expectActionMetadata(action);
    });

    it("should execute synchronous craft function with string input", async () => {
      const action = craft((action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
          })
          .handler(async ({ input }) => {
            return `Hello ${input}!`;
          });
      });

      const result = await action("World");
      expectSuccessResult(result, "Hello World!");
    });

    it("should support synchronous craft functions with complex schemas", async () => {
      const action = craft((action) => {
        return action
          .schemas({
            inputSchema: userSchema,
          })
          .handler(async ({ input }) => {
            return {
              id: "123",
              ...input,
              createdAt: new Date("2024-01-01"),
            };
          });
      });

      const result = await action(testUser);
      expectSuccessResult(result, {
        id: "123",
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        createdAt: new Date("2024-01-01"),
      });
    });

    it("should support synchronous craft functions with error handling", async () => {
      const action = craft((action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
          })
          .errors(commonErrors)
          .handler(async ({ input, errors }) => {
            if (input === "missing") {
              return errors.notFound(input);
            }
            return `Found: ${input}`;
          });
      });

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

    it("should support synchronous craft functions with callbacks", async () => {
      let callbackData: any = null;

      const action = craft((action) => {
        return action
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
          });
      });

      const result = await action("test");
      expectSuccessResult(result, "Processed: test");
      expect(callbackData).toBe("Processed: test");
    });

    it("should support synchronous craft functions with configuration", async () => {
      const action = craft((action) => {
        return action
          .config({
            resultFormat: "api" as const,
          })
          .schemas({
            inputSchema: stringSchema,
          })
          .handler(async ({ input }) => {
            return `Configured: ${input}`;
          });
      });

      const result = await action("test");
      expectSuccessResult(result, "Configured: test");
      expectActionMetadata(action);
    });

    it("should support method chaining in synchronous craft functions", async () => {
      const action = craft((action) => {
        return action
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
          });
      });

      const result = await action("test");
      expectSuccessResult(result, "Chained: test");
    });

    it("should support synchronous craft functions with bind arguments", async () => {
      const action = craft((action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema, userSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [num, user] = bindArgs;
            return `${input}-${num}-${user.name}`;
          });
      });

      // Call with bind arguments - the correct order is: bindArg1, bindArg2, ..., input
      const result = await action(42, testUser, "test");
      expectSuccessResult(result, "test-42-John Doe");
    });

    it("should support synchronous craft functions with output schema validation", async () => {
      const action = craft((action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: stringSchema,
          })
          .handler(async ({ input }) => {
            return `Processed: ${input}`;
          });
      });

      const result = await action("test");
      expectSuccessResult(result, "Processed: test");
    });

    it("should support synchronous craft functions with multiple error types", async () => {
      const action = craft((action) => {
        return action
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
          });
      });

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

    it("should support synchronous craft functions with complex callback scenarios", async () => {
      let successCallbackData: any = null;
      let errorCallbackData: any = null;
      let settledCallbackData: any = null;

      const action = craft((action) => {
        return action
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
          });
      });

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

    it("should support synchronous craft functions with no input schema", async () => {
      const action = craft((action) => {
        return action.handler(async () => {
          return "No input required";
        });
      });

      const result = await action();
      expectSuccessResult(result, "No input required");
    });

    it("should support synchronous craft functions with functional result format", async () => {
      const action = craft((action) => {
        return action
          .config({
            resultFormat: "functional" as const,
          })
          .schemas({
            inputSchema: stringSchema,
          })
          .handler(async ({ input }) => {
            return `Functional: ${input}`;
          });
      });

      const result = await action("test");
      // For functional format, the result structure might be different
      // but we still expect it to be successful
      expect(result).toBeDefined();
    });

    it("should support synchronous craft functions with custom error handling", async () => {
      const customErrorHandler = (error: unknown) => ({
        type: "CUSTOM_UNHANDLED" as const,
        originalError: error,
        timestamp: new Date().toISOString(),
      });

      const action = craft((action) => {
        return action
          .config({
            handleThrownError: customErrorHandler,
          })
          .handler(async () => {
            throw new Error("Intentional error");
          });
      });

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

  describe("Asynchronous craft functions", () => {
    it("should support async builder functions with basic handler", async () => {
      const action = craft(async (action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
          })
          .handler(async ({ input }) => {
            return `Hello ${input}!`;
          });
      });

      const result = await action("World");
      expectSuccessResult(result, "Hello World!");
    });

    it("should support async builder functions with complex schemas", async () => {
      const action = craft(async (action) => {
        return action
          .schemas({
            inputSchema: userSchema,
          })
          .handler(async ({ input }) => {
            return {
              id: "123",
              ...input,
              createdAt: new Date("2024-01-01"),
            };
          });
      });

      const result = await action(testUser);
      expectSuccessResult(result, {
        id: "123",
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        createdAt: new Date("2024-01-01"),
      });
    });

    it("should support async builder functions with error handling", async () => {
      const action = craft(async (action) => {
        return action
          .schemas({
            inputSchema: stringSchema,
          })
          .errors(commonErrors)
          .handler(async ({ input, errors }) => {
            if (input === "missing") {
              return errors.notFound(input);
            }
            return `Found: ${input}`;
          });
      });

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

    it("should support async builder functions with callbacks", async () => {
      let callbackData: any = null;

      const action = craft(async (action) => {
        return action
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
          });
      });

      const result = await action("test");
      expectSuccessResult(result, "Processed: test");
      expect(callbackData).toBe("Processed: test");
    });

    it("should preserve action metadata for async actions", async () => {
      const action = craft(async (action) => {
        return action
          .config({
            resultFormat: "api" as const,
          })
          .handler(async () => {
            return "test";
          });
      });

      // Wait a bit for the async metadata assignment to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expectActionMetadata(action);
    });

    it("should support async method chaining", async () => {
      const action = craft(async (action) => {
        // Simulate async operations in builder
        await new Promise((resolve) => setTimeout(resolve, 1));

        return action
          .config({ resultFormat: "api" as const })
          .schemas({ inputSchema: stringSchema })
          .errors(commonErrors)
          .handler(async ({ input, errors }) => {
            if (input === "error") {
              return errors.validation("input");
            }
            return `Async chained: ${input}`;
          })
          .callbacks({
            onSuccess: () => {
              // Success callback
            },
          });
      });

      const result = await action("test");
      expectSuccessResult(result, "Async chained: test");
    });
  });

  describe("Edge cases and error scenarios", () => {
    it("should handle synchronous craft function with immediate error", async () => {
      const action = craft((action) => {
        return action
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
          });
      });

      const result = await action("test");
      expectErrorResult(result, {
        type: "IMMEDIATE_ERROR",
        message: "Immediate error",
      });
    });

    it("should handle async craft function with delayed error", async () => {
      const action = craft(async (action) => {
        await new Promise((resolve) => setTimeout(resolve, 1));

        return action
          .schemas({
            inputSchema: stringSchema,
          })
          .errors({
            delayed: () => ({
              type: "DELAYED_ERROR" as const,
              message: "Delayed error",
            }),
          })
          .handler(async ({ errors }) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return errors.delayed();
          });
      });

      const result = await action("test");
      expectErrorResult(result, {
        type: "DELAYED_ERROR",
        message: "Delayed error",
      });
    });

    it("should maintain consistent action IDs for synchronous craft functions", () => {
      const action1 = craft((action) => {
        return action.handler(async () => "test");
      });

      const action2 = craft((action) => {
        return action.handler(async () => "test");
      });

      // Different actions should have different IDs
      expect((action1 as any).__ac_id).not.toBe((action2 as any).__ac_id);
    });

    it("should maintain consistent action IDs for async craft functions", async () => {
      const action = craft(async (action) => {
        return action.handler(async () => "test");
      });

      // Wait for metadata to be assigned
      await new Promise((resolve) => setTimeout(resolve, 10));

      const id1 = (action as any).__ac_id;

      // Wait a bit more and check again
      await new Promise((resolve) => setTimeout(resolve, 10));

      const id2 = (action as any).__ac_id;

      // Same action should maintain the same ID
      expect(id1).toBe(id2);
      expect(id1).toBeDefined();
    });
  });
});
