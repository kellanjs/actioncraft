import { actioncraft } from "../../../src/index";
import { stringSchema, numberSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Async Error Boundaries", () => {
  describe("Promise Rejection Handling", () => {
    it("should handle rejected promises in async handlers", async () => {
      const action = actioncraft()
        .config({
          handleThrownError: (error: unknown) => ({
            type: "ASYNC_REJECTION" as const,
            message: error instanceof Error ? error.message : String(error),
            isRejection: true,
          }),
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          if (input === "reject") {
            return Promise.reject(new Error("Async operation failed"));
          }
          if (input === "reject-string") {
            return Promise.reject("String rejection");
          }
          if (input === "reject-object") {
            return Promise.reject({ code: 500, message: "Object rejection" });
          }
          return "success";
        })
        .build();

      // Test Error rejection
      const errorResult = await action("reject");
      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error.type).toBe("ASYNC_REJECTION");
        expect(errorResult.error.message).toBe("Async operation failed");
        // @ts-expect-error - Testing error structure
        expect(errorResult.error.isRejection).toBe(true);
      }

      // Test string rejection
      const stringResult = await action("reject-string");
      expect(stringResult.success).toBe(false);
      if (!stringResult.success) {
        expect(stringResult.error.type).toBe("ASYNC_REJECTION");
        expect(stringResult.error.message).toBe("String rejection");
      }

      // Test object rejection
      const objectResult = await action("reject-object");
      expect(objectResult.success).toBe(false);
      if (!objectResult.success) {
        expect(objectResult.error.type).toBe("ASYNC_REJECTION");
        expect(objectResult.error.message).toBe("[object Object]");
      }
    });

    it("should handle timeout scenarios in async operations", async () => {
      const timeoutAction = actioncraft()
        .config({
          handleThrownError: (error: unknown) => ({
            type: "TIMEOUT_ERROR" as const,
            message:
              error instanceof Error ? error.message : "Operation timed out",
            isTimeout: true,
          }),
        })
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Operation timed out")), input);
          });

          const operationPromise = new Promise((resolve) => {
            setTimeout(() => resolve("completed"), input + 100);
          });

          return Promise.race([timeoutPromise, operationPromise]);
        })
        .build();

      // Test timeout (50ms timeout, operation takes 150ms)
      const result = await timeoutAction(50);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("TIMEOUT_ERROR");
        expect(result.error.message).toBe("Operation timed out");
        // @ts-expect-error - Testing error structure
        expect(result.error.isTimeout).toBe(true);
      }
    });

    it("should handle concurrent async operations with partial failures", async () => {
      const concurrentAction = actioncraft()
        .schemas({ inputSchema: z.array(stringSchema) })
        .errors({
          concurrentFailure: (
            results: Array<{
              id: string;
              success: boolean;
              data?: any;
              error?: string;
            }>,
          ) => ({
            type: "CONCURRENT_FAILURE" as const,
            results,
            successCount: results.filter((r) => r.success).length,
            failureCount: results.filter((r) => !r.success).length,
          }),
        })
        .handler(async ({ input, errors }) => {
          const operations = input.map(async (item, index) => {
            try {
              if (item.startsWith("fail-")) {
                throw new Error(`Operation ${index} failed`);
              }

              // Simulate async work with random delay
              await new Promise((resolve) =>
                setTimeout(resolve, Math.random() * 50),
              );

              return {
                id: `op-${index}`,
                success: true,
                data: `processed-${item}`,
              };
            } catch (error) {
              return {
                id: `op-${index}`,
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          });

          const results = await Promise.all(operations);
          const hasFailures = results.some((r) => !r.success);

          if (hasFailures) {
            return errors.concurrentFailure(results);
          }

          return results.map((r) => r.data);
        })
        .build();

      const mixedInput = [
        "item1",
        "fail-item2",
        "item3",
        "fail-item4",
        "item5",
      ];
      const result = await concurrentAction(mixedInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("CONCURRENT_FAILURE");
        // @ts-expect-error - Testing error structure
        expect(result.error.successCount).toBe(3);
        // @ts-expect-error - Testing error structure
        expect(result.error.failureCount).toBe(2);
        // @ts-expect-error - Testing error structure
        expect(result.error.results).toHaveLength(5);
      }
    });
  });

  describe("Async Resource Management", () => {
    it("should handle resource cleanup on async errors", async () => {
      let resourcesAtError: string[] = [];

      const resourceAction = actioncraft()
        .config({
          handleThrownError: (error: unknown) => ({
            type: "RESOURCE_ERROR" as const,
            message: error instanceof Error ? error.message : String(error),
            resourcesAtError: [...resourcesAtError],
          }),
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          const resources: string[] = [];

          // Simulate resource acquisition
          resources.push("database-connection");
          resources.push("file-handle");
          resources.push("network-socket");

          try {
            if (input === "fail-after-resources") {
              // Capture resources before error
              resourcesAtError = [...resources];
              throw new Error("Operation failed after resource allocation");
            }

            return "operation-completed";
          } finally {
            // Simulate resource cleanup
            resources.length = 0;
          }
        })
        .build();

      const result = await resourceAction("fail-after-resources");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("RESOURCE_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.resourcesAtError).toEqual([
          "database-connection",
          "file-handle",
          "network-socket",
        ]);
      }
    });

    it("should handle async generator errors", async () => {
      async function* failingGenerator() {
        yield "item1";
        yield "item2";
        throw new Error("Generator failed");
      }

      const generatorAction = actioncraft()
        .config({
          handleThrownError: (error: unknown) => ({
            type: "GENERATOR_ERROR" as const,
            message: error instanceof Error ? error.message : String(error),
            isGeneratorError: true,
          }),
        })
        .handler(async () => {
          const results: string[] = [];

          for await (const item of failingGenerator()) {
            results.push(item);
          }

          return results;
        })
        .build();

      const result = await generatorAction();
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("GENERATOR_ERROR");
        expect(result.error.message).toBe("Generator failed");
        // @ts-expect-error - Testing error structure
        expect(result.error.isGeneratorError).toBe(true);
      }
    });

    it("should handle async iterator cleanup on errors", async () => {
      let cleanupCalled = false;

      async function* cleanupGenerator() {
        try {
          yield "item1";
          yield "item2";
          throw new Error("Iterator error");
        } finally {
          cleanupCalled = true;
        }
      }

      const iteratorAction = actioncraft()
        .config({
          handleThrownError: (error: unknown) => ({
            type: "ITERATOR_ERROR" as const,
            message: error instanceof Error ? error.message : String(error),
            cleanupExecuted: cleanupCalled,
          }),
        })
        .handler(async () => {
          const results: string[] = [];
          const iterator = cleanupGenerator();

          for await (const item of iterator) {
            results.push(item);
          }

          return results;
        })
        .build();

      const result = await iteratorAction();
      expect(result.success).toBe(false);
      expect(cleanupCalled).toBe(true);

      if (!result.success) {
        expect(result.error.type).toBe("ITERATOR_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.cleanupExecuted).toBe(true);
      }
    });
  });

  describe("Async Callback Error Handling", () => {
    it("should handle errors in async callbacks without affecting main flow", async () => {
      let callbackExecuted = false;

      const callbackAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return `processed-${input}`;
        })
        .callbacks({
          onSuccess: async () => {
            callbackExecuted = true;
            // Callbacks that throw errors should not affect the main result
            throw new Error("Success callback failed");
          },
        })
        .build();

      const result = await callbackAction("test");

      // Main action should still succeed despite callback errors
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed-test");
      }

      // Verify callback was executed
      expect(callbackExecuted).toBe(true);
    });

    it("should handle async callback execution", async () => {
      let callbackCompleted = false;

      const callbackAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return `processed-${input}`;
        })
        .callbacks({
          onSuccess: async () => {
            // Simulate async callback work
            await new Promise((resolve) => setTimeout(resolve, 10));
            callbackCompleted = true;
          },
        })
        .build();

      const result = await callbackAction("test");

      // Action should succeed
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed-test");
      }

      // Callback should complete
      expect(callbackCompleted).toBe(true);
    });
  });

  describe("Async Validation Error Boundaries", () => {
    it("should handle async validation errors in custom schemas", async () => {
      const asyncValidationSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: async (input: unknown) => {
            // Simulate async validation (e.g., database lookup)
            await new Promise((resolve) => setTimeout(resolve, 10));

            if (input === "async-fail") {
              throw new Error("Async validation failed");
            }

            if (typeof input === "string" && input.length > 0) {
              return { value: input };
            }

            return {
              issues: [{ message: "Must be a non-empty string", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const asyncValidationAction = actioncraft()
        .config({
          handleThrownError: (error: unknown) => ({
            type: "ASYNC_VALIDATION_ERROR" as const,
            message: error instanceof Error ? error.message : String(error),
          }),
        })
        .schemas({ inputSchema: asyncValidationSchema })
        .handler(async ({ input }) => {
          return `validated-${input}`;
        })
        .build();

      // Test async validation failure
      const result = await asyncValidationAction("async-fail");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("ASYNC_VALIDATION_ERROR");
        expect(result.error.message).toBe("Async validation failed");
      }
    });

    it("should handle concurrent validation errors", async () => {
      const concurrentValidationAction = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, stringSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          return { input, bindArgs };
        })
        .build();

      // Test concurrent validation failures
      const result = await concurrentValidationAction(
        123,
        "invalid-number",
        // @ts-expect-error - Testing invalid inputs
        456,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should get the first validation error (input validation)
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Memory and Resource Leak Prevention", () => {
    it("should prevent memory leaks in error scenarios", async () => {
      const memoryAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          memoryError: (allocatedSize: number) => ({
            type: "MEMORY_ERROR" as const,
            allocatedSize,
            timestamp: Date.now(),
          }),
        })
        .handler(async ({ input, errors }) => {
          // Simulate memory allocation
          const largeArray = new Array(1000000).fill(input);

          if (input === "memory-fail") {
            // Error should not prevent garbage collection
            return errors.memoryError(largeArray.length);
          }

          return "memory-success";
        })
        .build();

      const result = await memoryAction("memory-fail");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("MEMORY_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.allocatedSize).toBe(1000000);
      }

      // Force garbage collection if available
      if ((globalThis as any).gc) {
        (globalThis as any).gc();
      }
    });

    it("should handle WeakRef cleanup in error scenarios", async () => {
      let weakRefTarget = { id: "test-object" };
      const weakRef = new WeakRef(weakRefTarget);

      const weakRefAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          weakRefError: (hasTarget: boolean) => ({
            type: "WEAK_REF_ERROR" as const,
            hasTarget,
          }),
        })
        .handler(async ({ input, errors }) => {
          const target = weakRef.deref();

          if (input === "clear-ref") {
            weakRefTarget = null as any;
            // Force garbage collection if available
            if ((globalThis as any).gc) {
              (globalThis as any).gc();
            }
            return errors.weakRefError(target !== undefined);
          }

          return target ? "target-exists" : "target-cleared";
        })
        .build();

      const result = await weakRefAction("clear-ref");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("WEAK_REF_ERROR");
      }
    });
  });
});
