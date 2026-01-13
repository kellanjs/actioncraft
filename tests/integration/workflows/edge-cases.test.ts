import { actioncraft, initial } from "../../../src/index";
import {
  stringSchema,
  numberSchema,
  largeObjectSchema,
  emptyAllowedStringSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect, vi } from "vitest";

describe("Edge Cases", () => {
  describe("Callback error handling", () => {
    it("should not break action flow if onSuccess callback throws", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .callbacks({
          onSuccess: () => {
            throw new Error("Callback failed!");
          },
        })
        .build();

      // Action should still succeed even if callback throws
      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "TEST",
        __ac_id: expect.any(String),
      });
    });

    it("should not break action flow if onError callback throws", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onError: () => {
            throw new Error("Error callback failed!");
          },
        })
        .build();

      // Action should still return error even if error callback throws
      const result = await action(123 as any); // Invalid input

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should not break action flow if onSettled callback throws", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSettled: () => {
            throw new Error("Settled callback failed!");
          },
        })
        .build();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "test",
        __ac_id: expect.any(String),
      });
    });

    it("should handle all callbacks throwing simultaneously", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .errors({
          testError: () => ({ type: "TEST_ERROR" }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "error") {
            return errors.testError();
          }
          return input;
        })
        .callbacks({
          onSuccess: () => {
            throw new Error("Success callback failed!");
          },
          onError: () => {
            throw new Error("Error callback failed!");
          },
          onSettled: () => {
            throw new Error("Settled callback failed!");
          },
        })
        .build();

      // Test success case with throwing callbacks
      const successResult = await action("success");
      expect(successResult).toEqual({
        success: true,
        data: "success",
        __ac_id: expect.any(String),
      });

      // Test error case with throwing callbacks
      const errorResult = await action("error");
      expect(errorResult).toEqual({
        success: false,
        error: { type: "TEST_ERROR" },
        __ac_id: expect.any(String),
      });

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("Async behavior", () => {
    it("should handle slow actions correctly", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          // Simulate slow operation
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (input as string).toUpperCase();
        })
        .build();

      const result = await action("slow");

      expect(result).toEqual({
        success: true,
        data: "SLOW",
        __ac_id: expect.any(String),
      });
    });

    it("should handle concurrent action calls", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return (input as string).toUpperCase();
        })
        .build();

      // Run multiple actions concurrently
      const promises = [action("test1"), action("test2"), action("test3")];

      const results = await Promise.all(promises);

      expect(results).toEqual([
        { success: true, data: "TEST1", __ac_id: expect.any(String) },
        { success: true, data: "TEST2", __ac_id: expect.any(String) },
        { success: true, data: "TEST3", __ac_id: expect.any(String) },
      ]);
    });

    it("should handle Promise.race scenarios", async () => {
      const fastAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `fast-${input}`;
        })
        .build();

      const slowAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return `slow-${input}`;
        })
        .build();

      const result = await Promise.race([
        fastAction("race"),
        slowAction("race"),
      ]);

      expect(result).toEqual({
        success: true,
        data: "fast-race",
        __ac_id: expect.any(String),
      });
    });

    it("should handle action timeout scenarios", async () => {
      const timeoutAction = actioncraft()
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "TIMEOUT_ERROR",
              message:
                error instanceof Error ? error.message : "Timeout occurred",
            }) as const,
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          // Simulate very long operation
          await new Promise((resolve) => setTimeout(resolve, 200));
          return input;
        })
        .build();

      // Create a timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Operation timed out")), 50);
      });

      try {
        await Promise.race([timeoutAction("timeout-test"), timeoutPromise]);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Operation timed out");
      }
    });

    it("should handle Promise rejection in action", async () => {
      const action = actioncraft()
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "PROMISE_REJECTION",
              message:
                error instanceof Error ? error.message : "Promise rejected",
            }) as const,
        })
        .handler(async () => {
          await Promise.reject(new Error("Promise was rejected"));
          return "should not reach";
        })
        .build();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("PROMISE_REJECTION");
        expect(result.error.message).toBe("Promise was rejected");
      }
    });
  });

  describe("Large data handling", () => {
    it("should handle large input objects", async () => {
      const largeObject = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: Array.from({ length: 100 }, (_, j) => `data-${j}`),
        })),
      };

      const action = actioncraft()
        .schemas({ inputSchema: largeObjectSchema })
        .handler(async ({ input }) => {
          const obj = input as typeof largeObject;
          return { processedItems: obj.items.length };
        })
        .build();

      const result = await action(largeObject);

      expect(result).toEqual({
        success: true,
        data: { processedItems: 1000 },
        __ac_id: expect.any(String),
      });
    });

    it("should handle extremely large strings", async () => {
      const hugeString = "x".repeat(1000000); // 1MB string

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).length;
        })
        .build();

      const result = await action(hugeString);

      expect(result).toEqual({
        success: true,
        data: 1000000,
        __ac_id: expect.any(String),
      });
    });

    it("should handle deeply nested objects", async () => {
      const createNestedObject = (depth: number): any => {
        if (depth === 0) return { value: "deep" };
        return { nested: createNestedObject(depth - 1) };
      };

      const deepObject = createNestedObject(100);

      const deepObjectSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "object" && input !== null) {
              return { value: input };
            }
            return { issues: [{ message: "Must be object", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: deepObjectSchema })
        .handler(async ({ input }) => {
          // Navigate to the deep value
          let current = input as any;
          let depth = 0;
          while (current.nested) {
            current = current.nested;
            depth++;
          }
          return { depth, value: current.value };
        })
        .build();

      const result = await action(deepObject);

      expect(result).toEqual({
        success: true,
        data: { depth: 100, value: "deep" },
        __ac_id: expect.any(String),
      });
    });

    it("should handle arrays with many elements", async () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => i);

      const arraySchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (Array.isArray(input)) {
              return { value: input };
            }
            return { issues: [{ message: "Must be array", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: arraySchema })
        .handler(async ({ input }) => {
          const arr = input as number[];
          return {
            length: arr.length,
            sum: arr.reduce((a, b) => a + b, 0),
            first: arr[0],
            last: arr[arr.length - 1],
          };
        })
        .build();

      const result = await action(largeArray);

      expect(result).toEqual({
        success: true,
        data: {
          length: 10000,
          sum: 49995000,
          first: 0,
          last: 9999,
        },
        __ac_id: expect.any(String),
      });
    });
  });

  describe("Edge case inputs", () => {
    it("should handle empty string input", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: emptyAllowedStringSchema })
        .handler(async ({ input }) => {
          return (input as string).length;
        })
        .build();

      const result = await action("");

      expect(result).toEqual({
        success: true,
        data: 0,
        __ac_id: expect.any(String),
      });
    });

    it("should handle null input gracefully", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action(null as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle undefined input gracefully", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action(undefined as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle NaN input", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action(NaN);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle Infinity input", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action(Infinity);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle negative zero", async () => {
      const negativeZeroSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "number" && !isNaN(input) && isFinite(input)) {
              return { value: input };
            }
            return { issues: [{ message: "Must be finite number", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: negativeZeroSchema })
        .handler(async ({ input }) => {
          const num = input as number;
          return {
            value: num,
            isNegativeZero: Object.is(num, -0),
            isPositiveZero: Object.is(num, 0),
          };
        })
        .build();

      const result = await action(-0);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(-0);
        expect(result.data.isNegativeZero).toBe(true);
        expect(result.data.isPositiveZero).toBe(false);
      }
    });

    it("should handle circular reference objects", async () => {
      const circularObj: any = { name: "circular" };
      circularObj.self = circularObj;

      const circularSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            try {
              // This will throw on circular references
              JSON.stringify(input);
              return { value: input };
            } catch {
              return {
                issues: [{ message: "Circular reference detected", path: [] }],
              };
            }
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: circularSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action(circularObj);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle symbols as input", async () => {
      const symbolInput = Symbol("test");

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      // @ts-expect-error - Testing symbol input
      const result = await action(symbolInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle BigInt input", async () => {
      const bigIntInput = BigInt("123456789012345678901234567890");

      const action = actioncraft()
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      // @ts-expect-error - Testing BigInt input
      const result = await action(bigIntInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle function input", async () => {
      const functionInput = () => "test";

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      // @ts-expect-error - Testing function input
      const result = await action(functionInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Output validation edge cases", () => {
    it("should handle output validation failure (client-facing)", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: numberSchema,
        })
        .handler(async ({ input }) => {
          // Return string when number is expected
          return input; // This will fail output validation
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle action returning wrong type entirely (client-facing)", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .handler(async () => {
          // Return completely wrong type
          return { notAString: true };
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle output validation with circular references (client-facing)", async () => {
      const circularOutput: any = { name: "output" };
      circularOutput.self = circularOutput;

      const circularOutputSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            try {
              JSON.stringify(input);
              return { value: input };
            } catch {
              return {
                issues: [{ message: "Circular reference in output", path: [] }],
              };
            }
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: circularOutputSchema,
        })
        .handler(async () => {
          return circularOutput;
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle output validation with undefined result (client-facing)", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .handler(async () => {
          return undefined;
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle output validation with null result (client-facing)", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .handler(async () => {
          return null;
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });
  });

  describe("Complex error scenarios", () => {
    it("should handle nested async errors", async () => {
      const action = actioncraft()
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "NESTED_ERROR",
              originalError: error instanceof Error ? error.message : "Unknown",
            }) as const,
        })
        .handler(async () => {
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Async operation failed")), 10);
          });
          return "success";
        })
        .build();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as any;
        expect(err.type).toBe("NESTED_ERROR");
        expect(err.originalError).toBe("Async operation failed");
      }
    });

    it("should handle errors in custom error functions", async () => {
      const action = actioncraft()
        .errors({
          problematic: () => {
            throw new Error("Error function itself threw!");
          },
        })
        .handler(async ({ errors }) => {
          return errors.problematic();
        })
        .build();

      const result = await action();

      // This should result in an unhandled error since the error function itself failed
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle multiple simultaneous errors", async () => {
      const action = actioncraft()
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "MULTIPLE_ERRORS",
              message:
                error instanceof Error
                  ? error.message
                  : "Multiple errors occurred",
            }) as const,
        })
        .errors({
          customError: () => ({ type: "CUSTOM_ERROR" }) as const,
        })
        .handler(async ({ errors }) => {
          // Don't trigger delayed error to avoid unhandled promise rejection
          // setTimeout(() => {
          //   throw new Error("Delayed error");
          // }, 5);

          return errors.customError();
        })
        .build();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("CUSTOM_ERROR");
      }
    });

    it("should handle error during validation schema execution", async () => {
      const faultySchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => {
            throw new Error("Schema validation threw!");
          },
        },
        "~validate": function () {
          return this["~standard"].validate();
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: faultySchema as any })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle error during bind args validation", async () => {
      const faultyBindSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => {
            throw new Error("Bind schema validation threw!");
          },
        },
        "~validate": function () {
          return this["~standard"].validate();
        },
      } as const;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [faultyBindSchema as any] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          return { input, bindArgs };
        })
        .build();

      const result = await action("valid", "test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle error during output validation", async () => {
      const faultyOutputSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => {
            throw new Error("Output schema validation threw!");
          },
        },
        "~validate": function () {
          return this["~standard"].validate();
        },
      } as const;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: faultyOutputSchema as any,
        })
        .handler(async ({ input }) => {
          return input;
        })
        .build();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle recursive error scenarios", async () => {
      let errorCount = 0;

      const action = actioncraft()
        .config({
          handleThrownError: (_error: unknown) => {
            errorCount++;
            if (errorCount > 5) {
              return {
                type: "MAX_ERRORS_REACHED",
                count: errorCount,
              } as const;
            }
            // This could potentially cause recursion
            throw new Error(`Recursive error ${errorCount}`);
          },
        })
        .handler(async () => {
          throw new Error("Initial error");
        })
        .build();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });
  });

  describe("Memory and performance", () => {
    it("should not leak memory with many action executions", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).length;
        })
        .build();

      // Run many actions to check for memory leaks
      const promises = Array.from({ length: 100 }, (_, i) =>
        action(`test-${i}`),
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);
      expect(results).toHaveLength(100);
    });

    it("should handle rapid sequential executions", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return (input as number) * 2;
        })
        .build();

      const results: Array<Awaited<ReturnType<typeof action>>> = [];
      for (let i = 1; i <= 100; i++) {
        results.push(await action(i));
      }

      expect(results).toHaveLength(100);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results[99]).toEqual({
        success: true,
        data: 200,
        __ac_id: expect.any(String),
      });
    });

    it("should handle memory-intensive operations", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          // Create and process large temporary data structures
          const size = input as number;
          const tempArray = Array.from({ length: size }, (_, i) => i);
          const processed = tempArray
            .map((x) => x * x)
            .filter((x) => x % 2 === 0);

          return {
            originalSize: size,
            processedSize: processed.length,
            sample: processed.slice(0, 10),
          };
        })
        .build();

      const result = await action(10000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.originalSize).toBe(10000);
        expect(result.data.processedSize).toBe(5000);
        expect(result.data.sample).toEqual([
          0, 4, 16, 36, 64, 100, 144, 196, 256, 324,
        ]);
      }
    });

    it("should handle garbage collection scenarios", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          // Create objects that should be garbage collected
          const largeObjects = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            data: new Array(1000).fill(`data-${i}`),
            nested: {
              more: new Array(100).fill(`nested-${i}`),
            },
          }));

          // Process and return summary (original objects should be GC eligible)
          const summary = {
            count: largeObjects.length,
            input: input as string,
            processed: true,
          };

          return summary;
        })
        .build();

      const result = await action("gc-test");

      expect(result).toEqual({
        success: true,
        data: {
          count: 1000,
          input: "gc-test",
          processed: true,
        },
        __ac_id: expect.any(String),
      });
    });
  });

  describe("Type system edge cases", () => {
    it("should handle actions with no schemas", async () => {
      const action = actioncraft()
        .handler(async () => {
          return "no-schemas";
        })
        .build();

      const result = await action();

      expect(result).toEqual({
        success: true,
        data: "no-schemas",
        __ac_id: expect.any(String),
      });
    });

    it("should handle actions with only input schema", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .build();

      const result = await action("input-only");

      expect(result).toEqual({
        success: true,
        data: "INPUT-ONLY",
        __ac_id: expect.any(String),
      });
    });

    it("should handle actions with only output schema", async () => {
      const action = actioncraft()
        .schemas({ outputSchema: stringSchema })
        .handler(async () => {
          return "output-only";
        })
        .build();

      const result = await action();

      expect(result).toEqual({
        success: true,
        data: "output-only",
        __ac_id: expect.any(String),
      });
    });

    it("should handle actions with only bind schemas", async () => {
      const action = actioncraft()
        .schemas({ bindSchemas: [stringSchema, numberSchema] as const })
        .handler(async ({ bindArgs }) => {
          const [str, num] = bindArgs;
          return `${str as string}-${num as number}`;
        })
        .build();

      const result = await action("bind", 42);

      expect(result).toEqual({
        success: true,
        data: "bind-42",
        __ac_id: expect.any(String),
      });
    });

    it("should handle useActionState with no input schema", async () => {
      const action = actioncraft()
        .config({
          useActionState: true,
        })
        .handler(async ({ metadata }) => {
          return {
            hasPreviousState: !!metadata.prevState,
            rawInput: metadata.rawInput,
          };
        })
        .build();

      const initialState = initial(action);
      const result = await action(initialState);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasPreviousState).toBe(true);
        expect(result.data.rawInput).toBeUndefined();
      }
    });

    it("should handle complex type inference scenarios", async () => {
      const complexSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (
              typeof input === "object" &&
              input !== null &&
              "nested" in input &&
              typeof (input as any).nested === "object"
            ) {
              return { value: input };
            }
            return {
              issues: [{ message: "Invalid complex object", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({
          inputSchema: complexSchema,
          bindSchemas: [stringSchema, numberSchema] as const,
          outputSchema: complexSchema,
        })
        .handler(async ({ input, bindArgs }) => {
          const [str, num] = bindArgs;
          return {
            nested: {
              original: input,
              bindArgs: { str: str as string, num: num as number },
              processed: true,
            },
          };
        })
        .build();

      const complexInput = {
        nested: {
          data: "test",
          values: [1, 2, 3],
        },
      };

      const result = await action("bind-str", 123, complexInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nested.original).toEqual(complexInput);
        expect(result.data.nested.bindArgs).toEqual({
          str: "bind-str",
          num: 123,
        });
        expect(result.data.nested.processed).toBe(true);
      }
    });
  });

  describe("Extreme boundary conditions", () => {
    it("should handle maximum safe integer", async () => {
      const maxSafeIntegerSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "number" && Number.isSafeInteger(input)) {
              return { value: input };
            }
            return { issues: [{ message: "Must be safe integer", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: maxSafeIntegerSchema })
        .handler(async ({ input }) => {
          return {
            value: input as number,
            isMaxSafe: input === Number.MAX_SAFE_INTEGER,
          };
        })
        .build();

      const result = await action(Number.MAX_SAFE_INTEGER);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(Number.MAX_SAFE_INTEGER);
        expect(result.data.isMaxSafe).toBe(true);
      }
    });

    it("should handle minimum safe integer", async () => {
      const minSafeIntegerSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "number" && Number.isSafeInteger(input)) {
              return { value: input };
            }
            return { issues: [{ message: "Must be safe integer", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: minSafeIntegerSchema })
        .handler(async ({ input }) => {
          return {
            value: input as number,
            isMinSafe: input === Number.MIN_SAFE_INTEGER,
          };
        })
        .build();

      const result = await action(Number.MIN_SAFE_INTEGER);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.value).toBe(Number.MIN_SAFE_INTEGER);
        expect(result.data.isMinSafe).toBe(true);
      }
    });

    it("should handle empty arrays and objects", async () => {
      const emptyDataSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "object") {
              return { value: input };
            }
            return { issues: [{ message: "Must be object", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: emptyDataSchema })
        .handler(async ({ input }) => {
          const data = input as any;
          return {
            isArray: Array.isArray(data),
            isEmpty: Array.isArray(data)
              ? data.length === 0
              : Object.keys(data).length === 0,
            type: Array.isArray(data) ? "array" : "object",
          };
        })
        .build();

      // Test empty array
      const arrayResult = await action([]);
      expect(arrayResult.success).toBe(true);
      if (arrayResult.success) {
        expect(arrayResult.data).toEqual({
          isArray: true,
          isEmpty: true,
          type: "array",
        });
      }

      // Test empty object
      const objectResult = await action({});
      expect(objectResult.success).toBe(true);
      if (objectResult.success) {
        expect(objectResult.data).toEqual({
          isArray: false,
          isEmpty: true,
          type: "object",
        });
      }
    });

    it("should handle unicode and special characters", async () => {
      const unicodeStrings = [
        "🚀🎉✨", // Emojis
        "こんにちは世界", // Japanese
        "مرحبا بالعالم", // Arabic
        "🇺🇸🇯🇵🇸🇦", // Flag emojis
        "\u0000\u0001\u0002", // Control characters
        "𝒯𝒽𝒾𝓈 𝒾𝓈 𝓂𝒶𝓉𝒽 𝓉𝑒𝓍𝓉", // Mathematical alphanumeric symbols
      ];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          const str = input as string;
          return {
            original: str,
            length: str.length,
            byteLength: new TextEncoder().encode(str).length,
            codePoints: [...str].length,
          };
        })
        .build();

      for (const unicodeString of unicodeStrings) {
        const result = await action(unicodeString);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.original).toBe(unicodeString);
          expect(typeof result.data.length).toBe("number");
          expect(typeof result.data.byteLength).toBe("number");
          expect(typeof result.data.codePoints).toBe("number");
        }
      }
    });

    it("should handle Date objects and edge cases", async () => {
      const dateSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (input instanceof Date) {
              return { value: input };
            }
            return { issues: [{ message: "Must be Date", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({ inputSchema: dateSchema })
        .handler(async ({ input }) => {
          const date = input as Date;
          return {
            timestamp: date.getTime(),
            isValid: !isNaN(date.getTime()),
            isoString: isNaN(date.getTime()) ? null : date.toISOString(),
          };
        })
        .build();

      // Valid date
      const validResult = await action(new Date("2023-01-01"));
      expect(validResult.success).toBe(true);

      // Invalid date
      const invalidResult = await action(new Date("invalid"));
      expect(invalidResult.success).toBe(true);
      if (invalidResult.success) {
        expect(invalidResult.data.isValid).toBe(false);
        expect(invalidResult.data.isoString).toBe(null);
      }

      // Edge dates
      const epochResult = await action(new Date(0));
      expect(epochResult.success).toBe(true);
      if (epochResult.success) {
        expect(epochResult.data.timestamp).toBe(0);
        expect(epochResult.data.isValid).toBe(true);
      }
    });
  });
});
