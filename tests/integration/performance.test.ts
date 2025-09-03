import { craft } from "../../src/index";
import { stringSchema, numberSchema } from "../fixtures/schemas";
import { describe, it, expect } from "../setup";

describe("Performance & Stress Testing", () => {
  describe("Large payload handling", () => {
    it("should handle large string inputs efficiently", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return {
              length: (input as string).length,
              firstChar: (input as string)[0],
              lastChar: (input as string)[(input as string).length - 1],
            };
          }),
      );

      // Create a large string (1MB)
      const largeString = "x".repeat(1024 * 1024);
      const startTime = Date.now();

      const result = await action(largeString);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(1024 * 1024);
        expect(result.data.firstChar).toBe("x");
        expect(result.data.lastChar).toBe("x");
      }

      // Should complete within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it("should handle large object inputs efficiently", async () => {
      const largeObjectSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "object" && input !== null) {
              return { value: input };
            }
            return {
              issues: [{ message: "Must be an object", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = craft((action) =>
        action
          .schemas({ inputSchema: largeObjectSchema })
          .handler(async ({ input }) => {
            const obj = input as Record<string, unknown>;
            return {
              keyCount: Object.keys(obj).length,
              hasData: Object.keys(obj).length > 0,
            };
          }),
      );

      // Create a large object (10,000 properties)
      const largeObject: Record<string, number> = {};
      for (let i = 0; i < 10000; i++) {
        largeObject[`key${i}`] = i;
      }

      const startTime = Date.now();
      const result = await action(largeObject);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keyCount).toBe(10000);
        expect(result.data.hasData).toBe(true);
      }

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it("should handle large array processing", async () => {
      const arraySchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (Array.isArray(input)) {
              return { value: input };
            }
            return {
              issues: [{ message: "Must be an array", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = craft((action) =>
        action
          .schemas({ inputSchema: arraySchema })
          .handler(async ({ input }) => {
            const arr = input as number[];
            return {
              length: arr.length,
              sum: arr.reduce((a, b) => a + b, 0),
              average: arr.reduce((a, b) => a + b, 0) / arr.length,
            };
          }),
      );

      // Create a large array (100,000 elements)
      const largeArray = Array.from({ length: 100000 }, (_, i) => i + 1);
      const startTime = Date.now();

      const result = await action(largeArray);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(100000);
        expect(result.data.sum).toBe(5000050000); // Sum of 1 to 100000
        expect(result.data.average).toBe(50000.5);
      }

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe("Concurrent execution", () => {
    it("should handle multiple concurrent actions", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            // Simulate some async work
            await new Promise((resolve) => setTimeout(resolve, 10));
            return (input as number) * 2;
          }),
      );

      const startTime = Date.now();

      // Run 50 concurrent actions
      const promises = Array.from({ length: 50 }, (_, i) => action(i + 1));
      const results = await Promise.all(promises);

      const endTime = Date.now();

      // All should succeed
      expect(results).toHaveLength(50);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe((index + 1) * 2);
        }
      });

      // Should complete faster than sequential execution
      // Sequential would take 50 * 10ms = 500ms minimum
      // Concurrent should still be noticeably faster; allow headroom for CI variance
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should handle concurrent actions with different inputs", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            // Simulate variable processing time based on input length
            const delay = Math.min((input as string).length, 50);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return (input as string).toUpperCase();
          }),
      );

      const inputs = [
        "short",
        "medium length string",
        "this is a much longer string for testing",
        "a",
        "concurrent processing test with variable lengths",
      ];

      const startTime = Date.now();
      const promises = inputs.map((input) => action(input));
      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(inputs.length);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(inputs[index].toUpperCase());
        }
      });

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(600);
    });

    it("should handle mixed success/error concurrent scenarios", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .errors({
            tooLarge: (value: number) =>
              ({
                type: "TOO_LARGE",
                value,
                limit: 100,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            await new Promise((resolve) => setTimeout(resolve, 5));

            if ((input as number) > 100) {
              return errors.tooLarge(input as number);
            }
            return (input as number) * 2;
          }),
      );

      // Mix of valid and invalid inputs
      const inputs = [1, 50, 150, 25, 200, 75, 300, 10];
      const promises = inputs.map((input) => action(input));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(inputs.length);

      // Check specific results
      expect(results[0].success).toBe(true); // 1 -> 2
      expect(results[1].success).toBe(true); // 50 -> 100
      expect(results[2].success).toBe(false); // 150 -> error
      expect(results[3].success).toBe(true); // 25 -> 50
      expect(results[4].success).toBe(false); // 200 -> error
      expect(results[5].success).toBe(true); // 75 -> 150
      expect(results[6].success).toBe(false); // 300 -> error
      expect(results[7].success).toBe(true); // 10 -> 20

      // Verify error details
      if (!results[2].success) {
        expect(results[2].error.type).toBe("TOO_LARGE");
      }
    });

    it("should support concurrent actions with useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input, metadata }) => {
            // Just return doubled value, ensure prevState is always defined
            expect(metadata.prevState).toBeDefined();
            return (input as number) * 2;
          }),
      );

      const previousState = {
        success: true as const,
        data: 0,
        __ac_id: "test-id",
      };

      const inputs = Array.from({ length: 20 }, (_, i) => i + 1);
      const promises = inputs.map((n) => action(previousState, n));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(inputs.length);
      results.forEach((result, idx) => {
        expect(result).toEqual({
          success: true,
          data: (idx + 1) * 2,
          values: idx + 1,
          __ac_id: expect.any(String),
        });
      });
    });
  });

  describe("Memory usage patterns", () => {
    it("should handle repeated action calls without memory accumulation", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            // Create and process some data
            const processed = (input as string).repeat(100);
            return {
              original: input,
              length: processed.length,
              checksum: processed.length.toString(16),
            };
          }),
      );

      // Run many iterations to test memory usage
      const iterations = 1000;
      const results: boolean[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await action(`test-${i}`);
        results.push(result.success);
      }

      // All iterations should succeed
      expect(results.every((success) => success)).toBe(true);
    });

    it("should handle callbacks without memory leaks", async () => {
      let callbackExecutions = 0;

      const action = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            return (input as number) * 2;
          })
          .callbacks({
            onSuccess: ({ data }) => {
              callbackExecutions++;
              // Simulate callback processing
              const temp = Array.from({ length: 1000 }, (_, i) => i + data);
              // Use temp to prevent optimization, but don't return anything
              void temp.length;
            },
            onSettled: () => {
              // Another callback that does some work
              const temp = Array.from({ length: 100 }, (_, i) => i.toString());
              // Use temp to prevent optimization, but don't return anything
              void temp.join(",");
            },
          }),
      );

      // Run multiple iterations with callbacks
      const iterations = 500;
      for (let i = 0; i < iterations; i++) {
        const result = await action(i + 1); // numberSchema requires positive numbers
        expect(result.success).toBe(true);
      }

      expect(callbackExecutions).toBe(iterations);
    });

    it("should handle large FormData without excessive memory usage", async () => {
      const formDataSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (input instanceof FormData) {
              const data: Record<string, string> = {};
              for (const [key, value] of input.entries()) {
                if (typeof value === "string") {
                  data[key] = value;
                }
              }
              return { value: data };
            }
            return {
              issues: [{ message: "Must be FormData", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = craft((action) =>
        action
          .schemas({ inputSchema: formDataSchema })
          .handler(async ({ input }) => {
            const data = input as Record<string, string>;
            return {
              fieldCount: Object.keys(data).length,
              totalLength: Object.values(data).join("").length,
            };
          }),
      );

      // Create FormData with many fields
      const formData = new FormData();
      for (let i = 0; i < 1000; i++) {
        formData.append(`field${i}`, `value${i}`.repeat(10));
      }

      const result = await action(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fieldCount).toBe(1000);
        expect(result.data.totalLength).toBeGreaterThan(0);
      }
    });
  });
});
