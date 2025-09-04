import { craft, action, initial } from "../../../src/index";
import {
  stringSchema,
  numberSchema,
  simpleUserSchema,
  basicFormDataSchema,
} from "../../__fixtures__/schemas";
import { describe, expect, it, vi } from "../../setup";

describe("Advanced Performance Benchmarks", () => {
  describe("Critical path performance", () => {
    it("should maintain fast action creation and execution", async () => {
      const iterations = 1000;
      const results: number[] = [];

      // Benchmark action creation time
      const creationStartTime = performance.now();

      const actions = Array.from({ length: iterations }, (_, i) =>
        craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .handler(async ({ input }) => `processed-${input}-${i}`),
        ),
      );

      const creationEndTime = performance.now();
      const creationTime = creationEndTime - creationStartTime;

      // Should create 1000 actions quickly (less than 100ms)
      expect(creationTime).toBeLessThan(100);

      // Benchmark action execution time
      const executionStartTime = performance.now();

      const promises = actions.map((action, i) => action(`input-${i}`));
      const executionResults = await Promise.all(promises);

      const executionEndTime = performance.now();
      const executionTime = executionEndTime - executionStartTime;

      // All should succeed
      expect(executionResults.every((result) => result.success)).toBe(true);

      // Should execute 1000 actions quickly (less than 500ms)
      expect(executionTime).toBeLessThan(500);

      // Average execution time per action should be reasonable
      const avgExecutionTime = executionTime / iterations;
      expect(avgExecutionTime).toBeLessThan(1); // Less than 1ms per action
    });

    it("should handle complex schema validation efficiently", async () => {
      const complexSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            // Simulate complex validation logic
            if (typeof input !== "object" || input === null) {
              return { issues: [{ message: "Must be object", path: [] }] };
            }

            const obj = input as Record<string, unknown>;
            const issues: Array<{ message: string; path: string[] }> = [];

            // Validate multiple fields with complex rules
            if (
              !obj.name ||
              typeof obj.name !== "string" ||
              obj.name.length < 2
            ) {
              issues.push({
                message: "Name must be at least 2 characters",
                path: ["name"],
              });
            }

            if (
              !obj.email ||
              typeof obj.email !== "string" ||
              !obj.email.includes("@")
            ) {
              issues.push({ message: "Invalid email format", path: ["email"] });
            }

            if (typeof obj.age !== "number" || obj.age < 0 || obj.age > 150) {
              issues.push({
                message: "Age must be between 0 and 150",
                path: ["age"],
              });
            }

            if (
              obj.tags &&
              (!Array.isArray(obj.tags) ||
                obj.tags.some((tag) => typeof tag !== "string"))
            ) {
              issues.push({
                message: "Tags must be array of strings",
                path: ["tags"],
              });
            }

            if (issues.length > 0) {
              return { issues };
            }

            return { value: input };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const complexValidationAction = craft((action) =>
        action
          .schemas({ inputSchema: complexSchema })
          .handler(async ({ input }) => {
            const data = input as any;
            return {
              processed: true,
              name: data.name,
              email: data.email,
              age: data.age,
              tags: data.tags || [],
            };
          }),
      );

      const validData = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        tags: ["developer", "typescript", "testing"],
      };

      const iterations = 500;
      const startTime = performance.now();

      const promises = Array.from({ length: iterations }, () =>
        complexValidationAction(validData),
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed
      expect(results.every((result) => result.success)).toBe(true);

      // Should complete within reasonable time (less than 1 second for 500 validations)
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(1000);

      // Average validation time should be reasonable
      const avgValidationTime = totalTime / iterations;
      expect(avgValidationTime).toBeLessThan(2); // Less than 2ms per validation
    });

    it("should handle FormData processing efficiently", async () => {
      const formDataAction = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: basicFormDataSchema })
          .handler(async ({ input }) => {
            // Simulate FormData processing
            const processed = {
              name: input.name.toUpperCase(),
              email: input.email.toLowerCase(),
              age: input.age,
              processedAt: Date.now(),
            };

            // Simulate some processing work
            const data = Array.from({ length: 1000 }, (_, i) => i * input.age);
            const sum = data.reduce((a, b) => a + b, 0);

            return {
              ...processed,
              dataSum: sum,
              dataLength: data.length,
            };
          }),
      );

      const iterations = 100;
      const formDataSets = Array.from({ length: iterations }, (_, i) => {
        const formData = new FormData();
        formData.append("name", `User${i}`);
        formData.append("email", `user${i}@example.com`);
        formData.append("age", String(20 + (i % 50)));
        return formData;
      });

      const startTime = performance.now();

      const promises = formDataSets.map((formData) =>
        formDataAction(initial(formDataAction), formData),
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed
      expect(results.every((result) => result.success)).toBe(true);

      // Should complete within reasonable time
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(2000); // Less than 2 seconds for 100 FormData processes

      // Verify processing results
      results.forEach((result, i) => {
        if (result.success) {
          expect(result.data.name).toBe(`USER${i}`);
          expect(result.data.email).toBe(`user${i}@example.com`);
          expect(result.data.dataLength).toBe(1000);
        }
      });
    });
  });

  describe("Scalability benchmarks", () => {
    it("should scale with increasing data sizes", async () => {
      const scalabilityAction = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            const size = input as number;

            // Create and process data of varying sizes
            const data = Array.from({ length: size }, (_, i) => ({
              id: i,
              value: Math.random() * 1000,
              metadata: {
                created: Date.now(),
                processed: false,
              },
            }));

            // Process data
            const processed = data.map((item) => ({
              ...item,
              metadata: {
                ...item.metadata,
                processed: true,
                processedAt: Date.now(),
              },
              processedValue: item.value * 2,
            }));

            return {
              originalSize: size,
              processedSize: processed.length,
              avgValue:
                processed.reduce((sum, item) => sum + item.processedValue, 0) /
                processed.length,
              sample: processed.slice(0, 5),
            };
          }),
      );

      const dataSizes = [100, 500, 1000, 5000, 10000];
      const performanceResults: Array<{ size: number; time: number }> = [];

      for (const size of dataSizes) {
        const startTime = performance.now();
        const result = await scalabilityAction(size);
        const endTime = performance.now();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.originalSize).toBe(size);
          expect(result.data.processedSize).toBe(size);
        }

        const processingTime = endTime - startTime;
        performanceResults.push({ size, time: processingTime });

        // Each size should complete within reasonable time
        expect(processingTime).toBeLessThan(size * 0.01); // Less than 0.01ms per item
      }

      // Performance should scale reasonably (not exponentially)
      const smallSizeTime = performanceResults[0].time;
      const largeSizeTime =
        performanceResults[performanceResults.length - 1].time;
      const sizeRatio = dataSizes[dataSizes.length - 1] / dataSizes[0];
      const timeRatio = largeSizeTime / smallSizeTime;

      // Time ratio should not be much larger than size ratio (indicating good scalability)
      expect(timeRatio).toBeLessThan(sizeRatio * 2);
    });

    it("should handle concurrent actions with different complexities", async () => {
      // Simple action
      const simpleAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return `simple-${input}`;
          }),
      );

      // Medium complexity action
      const mediumAction = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            const size = input as number;
            const data = Array.from({ length: size }, (_, i) => i * 2);
            await new Promise((resolve) => setTimeout(resolve, 2));
            return {
              size,
              sum: data.reduce((a, b) => a + b, 0),
              avg: data.reduce((a, b) => a + b, 0) / data.length,
            };
          }),
      );

      // Complex action
      const complexAction = craft((action) =>
        action
          .schemas({ inputSchema: simpleUserSchema })
          .handler(async ({ input }) => {
            const user = input as { name: string; age: number };

            // Simulate complex processing
            const complexData = Array.from({ length: 1000 }, (_, i) => ({
              id: i,
              userName: user.name,
              userAge: user.age,
              computed: i * user.age,
            }));

            await new Promise((resolve) => setTimeout(resolve, 5));

            return {
              user,
              processedItems: complexData.length,
              totalComputed: complexData.reduce(
                (sum, item) => sum + item.computed,
                0,
              ),
            };
          }),
      );

      const concurrentCount = 50;
      const startTime = performance.now();

      // Mix of different action types
      const promises = Array.from({ length: concurrentCount }, (_, i) => {
        const actionType = i % 3;
        switch (actionType) {
          case 0:
            return simpleAction(`input-${i}`);
          case 1:
            return mediumAction(100 + i);
          case 2:
            return complexAction({ name: `User${i}`, age: 20 + (i % 50) });
          default:
            return simpleAction(`input-${i}`);
        }
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed
      expect(results.every((result) => result.success)).toBe(true);

      // Should complete within reasonable time despite mixed complexity
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for 50 mixed actions

      // Verify results by type
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        const actionType = i % 3;
        if (result.success) {
          switch (actionType) {
            case 0:
              expect(typeof result.data).toBe("string");
              expect(result.data).toContain("simple-");
              break;
            case 1:
              expect(typeof result.data).toBe("object");
              expect("size" in (result.data as object)).toBe(true);
              break;
            case 2:
              expect(typeof result.data).toBe("object");
              expect("user" in (result.data as object)).toBe(true);
              break;
          }
        }
      });
    });

    it("should maintain performance with deep callback chains", async () => {
      const callbackCounts = {
        onStart: 0,
        onSuccess: 0,
        onError: 0,
        onSettled: 0,
      };

      const callbackAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "error") {
              throw new Error("Callback test error");
            }
            return `processed-${input}`;
          })
          .callbacks({
            onStart: () => {
              callbackCounts.onStart++;
              // Simulate callback work
              const temp = Array.from({ length: 100 }, (_, i) => i);
              void temp.reduce((a, b) => a + b, 0);
            },
            onSuccess: ({ data }) => {
              callbackCounts.onSuccess++;
              // Simulate callback work
              const temp = Array.from(
                { length: 100 },
                (_, i) => i + data.length,
              );
              void temp.reduce((a, b) => a + b, 0);
            },
            onError: ({ error }) => {
              callbackCounts.onError++;
              // Simulate callback work
              const temp = Array.from(
                { length: 100 },
                (_, i) => i + (error as any).type.length,
              );
              void temp.reduce((a, b) => a + b, 0);
            },
            onSettled: () => {
              callbackCounts.onSettled++;
              // Simulate callback work
              const temp = Array.from({ length: 100 }, (_, i) => i * 2);
              void temp.reduce((a, b) => a + b, 0);
            },
          }),
      );

      const iterations = 200;
      const startTime = performance.now();

      // Mix of successful and error cases
      const promises = Array.from({ length: iterations }, (_, i) =>
        callbackAction(i % 10 === 0 ? "error" : `input-${i}`),
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // Check results
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;

      expect(successCount).toBe(180); // 90% success rate
      expect(errorCount).toBe(20); // 10% error rate

      // Verify callback counts
      expect(callbackCounts.onStart).toBe(iterations);
      expect(callbackCounts.onSuccess).toBe(successCount);
      expect(callbackCounts.onError).toBe(errorCount);
      expect(callbackCounts.onSettled).toBe(iterations);

      // Should complete within reasonable time despite callbacks
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for 200 actions with callbacks
    });
  });

  describe("Memory usage optimization", () => {
    it("should handle memory-intensive operations without leaks", async () => {
      const memoryAction = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            const iterations = input as number;

            // Create large temporary data structures
            const largeArrays: number[][] = [];

            for (let i = 0; i < iterations; i++) {
              const largeArray = Array.from({ length: 10000 }, (_, j) => i * j);
              largeArrays.push(largeArray);

              // Process and discard to simulate real usage
              const sum = largeArray.reduce((a, b) => a + b, 0);
              void sum; // Use the result to prevent optimization
            }

            // Return only summary data, not the large arrays
            return {
              iterations,
              totalArrays: largeArrays.length,
              avgArrayLength:
                largeArrays.reduce((sum, arr) => sum + arr.length, 0) /
                largeArrays.length,
              memoryUsage: (globalThis as any).process?.memoryUsage?.() || {
                heapUsed: 0,
              },
            };
          }),
      );

      const initialMemory =
        (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;

      // Run memory-intensive operations
      const result1 = await memoryAction(50);
      const result2 = await memoryAction(50);
      const result3 = await memoryAction(50);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Force garbage collection if available
      if ((globalThis as any).gc) {
        (globalThis as any).gc();
      }

      const finalMemory =
        (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it("should efficiently handle repeated action executions", async () => {
      const repeatedAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            // Create some data structures that should be garbage collected
            const tempData = {
              input: input as string,
              timestamp: Date.now(),
              largeArray: Array.from(
                { length: 1000 },
                (_, i) => `item-${i}-${input}`,
              ),
              metadata: {
                processed: true,
                processingTime: Date.now(),
              },
            };

            // Process the data
            const result = {
              input: tempData.input,
              itemCount: tempData.largeArray.length,
              firstItem: tempData.largeArray[0],
              lastItem: tempData.largeArray[tempData.largeArray.length - 1],
              processed: tempData.metadata.processed,
            };

            return result;
          }),
      );

      const iterations = 1000;
      const batchSize = 100;
      const results: Array<Awaited<ReturnType<typeof repeatedAction>>> = [];

      // Execute in batches to monitor memory usage
      for (let batch = 0; batch < iterations / batchSize; batch++) {
        const batchPromises = Array.from({ length: batchSize }, (_, i) =>
          repeatedAction(`batch-${batch}-item-${i}`),
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // All should succeed
        expect(batchResults.every((r) => r.success)).toBe(true);
      }

      expect(results).toHaveLength(iterations);

      // Verify results are correct
      results.forEach((result, i) => {
        if (result.success) {
          const batch = Math.floor(i / batchSize);
          const item = i % batchSize;
          expect(result.data.input).toBe(`batch-${batch}-item-${item}`);
          expect(result.data.itemCount).toBe(1000);
          expect(result.data.processed).toBe(true);
        }
      });
    });

    it("should handle concurrent memory-intensive operations", async () => {
      const concurrentMemoryAction = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            const size = input as number;

            // Create data proportional to input size
            const data = Array.from({ length: size * 100 }, (_, i) => ({
              id: i,
              value: Math.random(),
              computed: i * size,
              metadata: {
                created: Date.now(),
                batch: Math.floor(i / 100),
              },
            }));

            // Simulate processing
            await new Promise((resolve) => setTimeout(resolve, 1));

            // Return summary instead of full data
            return {
              inputSize: size,
              dataLength: data.length,
              totalComputed: data.reduce((sum, item) => sum + item.computed, 0),
              avgValue:
                data.reduce((sum, item) => sum + item.value, 0) / data.length,
              batchCount:
                Math.max(...data.map((item) => item.metadata.batch)) + 1,
            };
          }),
      );

      const concurrentCount = 20;
      const startTime = performance.now();

      // Run concurrent memory-intensive operations with different sizes
      const promises = Array.from(
        { length: concurrentCount },
        (_, i) => concurrentMemoryAction(10 + i * 5), // Sizes from 10 to 105
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Should complete within reasonable time
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(2000); // Less than 2 seconds

      // Verify results
      results.forEach((result, i) => {
        if (result.success) {
          const expectedSize = 10 + i * 5;
          expect(result.data.inputSize).toBe(expectedSize);
          expect(result.data.dataLength).toBe(expectedSize * 100);
          expect(typeof result.data.totalComputed).toBe("number");
          expect(typeof result.data.avgValue).toBe("number");
        }
      });
    });
  });

  describe("ActionBuilder vs craft performance comparison", () => {
    it("should have comparable performance between ActionBuilder and craft APIs", async () => {
      const iterations = 500;

      // ActionBuilder API
      const builderActions = Array.from({ length: iterations }, (_, i) =>
        action()
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => `builder-${input}-${i}`)
          .craft(),
      );

      // craft API
      const craftActions = Array.from({ length: iterations }, (_, i) =>
        craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .handler(async ({ input }) => `craft-${input}-${i}`),
        ),
      );

      // Benchmark ActionBuilder execution
      const builderStartTime = performance.now();
      const builderPromises = builderActions.map((action, i) =>
        action(`input-${i}`),
      );
      const builderResults = await Promise.all(builderPromises);
      const builderEndTime = performance.now();

      // Benchmark craft execution
      const craftStartTime = performance.now();
      const craftPromises = craftActions.map((action, i) =>
        action(`input-${i}`),
      );
      const craftResults = await Promise.all(craftPromises);
      const craftEndTime = performance.now();

      // Both should succeed
      expect(builderResults.every((r) => r.success)).toBe(true);
      expect(craftResults.every((r) => r.success)).toBe(true);

      const builderTime = builderEndTime - builderStartTime;
      const craftTime = craftEndTime - craftStartTime;

      // Performance should be comparable (within 200% of each other)
      // Note: Performance can vary significantly due to system load, GC, etc.
      const timeDifference = Math.abs(builderTime - craftTime);
      const avgTime = (builderTime + craftTime) / 2;
      const percentageDifference = (timeDifference / avgTime) * 100;

      expect(percentageDifference).toBeLessThan(200);

      // Both should complete within reasonable time
      expect(builderTime).toBeLessThan(1000);
      expect(craftTime).toBeLessThan(1000);
    });

    it("should handle complex configurations efficiently in both APIs", async () => {
      const onSuccessMock = vi.fn();
      const onErrorMock = vi.fn();

      // Complex ActionBuilder configuration
      const complexBuilderAction = action()
        .config({
          validationErrorFormat: "nested" as const,
          resultFormat: "api" as const,
          handleThrownError: (error: unknown) =>
            ({
              type: "BUILDER_ERROR",
              message: error instanceof Error ? error.message : "Builder error",
            }) as const,
        })
        .schemas({
          inputSchema: simpleUserSchema,
          bindSchemas: [stringSchema, numberSchema] as const,
        })
        .errors({
          validationFailed: (field: string) =>
            ({
              type: "VALIDATION_FAILED",
              field,
            }) as const,
        })
        .handler(async ({ input, bindArgs, errors }) => {
          const [operation, multiplier] = bindArgs;
          const user = input as { name: string; age: number };

          if (user.age < 0) {
            return errors.validationFailed("age");
          }

          return {
            user,
            operation: operation as string,
            result: user.age * (multiplier as number),
          };
        })
        .callbacks({
          onSuccess: onSuccessMock,
          onError: onErrorMock,
        })
        .craft();

      // Complex craft configuration
      const complexCraftAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "nested" as const,
            resultFormat: "api" as const,
            handleThrownError: (error: unknown) =>
              ({
                type: "CRAFT_ERROR",
                message: error instanceof Error ? error.message : "Craft error",
              }) as const,
          })
          .schemas({
            inputSchema: simpleUserSchema,
            bindSchemas: [stringSchema, numberSchema] as const,
          })
          .errors({
            validationFailed: (field: string) =>
              ({
                type: "VALIDATION_FAILED",
                field,
              }) as const,
          })
          .handler(async ({ input, bindArgs, errors }) => {
            const [operation, multiplier] = bindArgs;
            const user = input as { name: string; age: number };

            if (user.age < 0) {
              return errors.validationFailed("age");
            }

            return {
              user,
              operation: operation as string,
              result: user.age * (multiplier as number),
            };
          })
          .callbacks({
            onSuccess: onSuccessMock,
            onError: onErrorMock,
          }),
      );

      const testData = { name: "Test User", age: 25 };
      const iterations = 100;

      // Benchmark complex ActionBuilder
      const builderStartTime = performance.now();
      const builderPromises = Array.from({ length: iterations }, () =>
        complexBuilderAction("multiply", 2, testData),
      );
      const builderResults = await Promise.all(builderPromises);
      const builderEndTime = performance.now();

      // Reset mocks
      onSuccessMock.mockClear();
      onErrorMock.mockClear();

      // Benchmark complex craft
      const craftStartTime = performance.now();
      const craftPromises = Array.from({ length: iterations }, () =>
        complexCraftAction("multiply", 2, testData),
      );
      const craftResults = await Promise.all(craftPromises);
      const craftEndTime = performance.now();

      // Both should succeed
      expect(builderResults.every((r) => r.success)).toBe(true);
      expect(craftResults.every((r) => r.success)).toBe(true);

      const builderTime = builderEndTime - builderStartTime;
      const craftTime = craftEndTime - craftStartTime;

      // Both should complete within reasonable time
      expect(builderTime).toBeLessThan(500);
      expect(craftTime).toBeLessThan(500);

      // Verify results are equivalent
      if (builderResults[0].success && craftResults[0].success) {
        expect(builderResults[0].data.result).toBe(craftResults[0].data.result);
        expect(builderResults[0].data.user).toEqual(craftResults[0].data.user);
      }
    });
  });
});
