import { craft, initial, getActionId } from "../../../src/index";
import { isOk, isErr } from "../../../src/types/result";
import {
  stringSchema,
  numberSchema,
  simpleUserSchema,
} from "../../__fixtures__/schemas";
import { describe, expect, it, vi } from "../../setup";

describe("Component Interactions", () => {
  describe("Schema validation interactions", () => {
    it("should handle schema composition and validation chaining", async () => {
      // Create a schema validator action
      const validateUserData = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .schemas({ inputSchema: simpleUserSchema })
          .handler(async ({ input }) => {
            const user = input as { name: string; age: number };
            return {
              isValid: true,
              validatedUser: user,
              validationTimestamp: Date.now(),
            };
          }),
      );

      // Create a data processor that uses validated data
      const processValidatedData = craft((action) =>
        action
          .schemas({
            inputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (
                    typeof input === "object" &&
                    input !== null &&
                    "isValid" in input &&
                    "validatedUser" in input
                  ) {
                    return { value: input };
                  }
                  return {
                    issues: [
                      { message: "Invalid validation result", path: [] },
                    ],
                  };
                },
              },
              "~validate": function (input: unknown) {
                return this["~standard"].validate(input);
              },
            } as const,
          })
          .handler(async ({ input }) => {
            const validationResult = input as any;
            const user = validationResult.validatedUser;

            return {
              processedUser: {
                ...user,
                displayName: `${user.name} (${user.age} years old)`,
                category: user.age >= 18 ? "adult" : "minor",
              },
              processingTimestamp: Date.now(),
              validationTimestamp: validationResult.validationTimestamp,
            };
          }),
      );

      // Test successful validation chain
      const userData = { name: "Alice", age: 25 };

      const validationResult = await validateUserData(userData);
      expect(isOk(validationResult)).toBe(true);
      if (!isOk(validationResult)) return;

      const processingResult = await processValidatedData(
        validationResult.value,
      );
      expect(processingResult.success).toBe(true);
      if (processingResult.success) {
        expect(processingResult.data.processedUser.displayName).toBe(
          "Alice (25 years old)",
        );
        expect(processingResult.data.processedUser.category).toBe("adult");
        expect(processingResult.data.validationTimestamp).toBe(
          validationResult.value.validationTimestamp,
        );
      }

      // Test validation failure propagation
      const invalidUserData = { name: "", age: -5 };

      const invalidValidationResult = await validateUserData(invalidUserData);
      expect(isErr(invalidValidationResult)).toBe(true);

      // Should not be able to process invalid data
      if (isErr(invalidValidationResult)) {
        const invalidProcessingResult = await processValidatedData({
          invalid: "data",
        });
        expect(invalidProcessingResult.success).toBe(false);
      }
    });

    it("should handle bind args validation across component interactions", async () => {
      // Component that validates and processes bind args
      const bindArgsProcessor = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [
              numberSchema,
              simpleUserSchema,
              stringSchema,
            ] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [multiplier, user, operation] = bindArgs;
            const text = input as string;

            let result: string;
            switch (operation) {
              case "repeat":
                result = text.repeat(multiplier as number);
                break;
              case "prefix":
                result = `${(user as any).name}: ${text}`;
                break;
              case "suffix":
                result = `${text} - ${(user as any).name} (${(user as any).age})`;
                break;
              default:
                result = text;
            }

            return {
              originalText: text,
              processedText: result,
              multiplier,
              user,
              operation,
            };
          }),
      );

      // Component that uses the processed result
      const resultConsumer = craft((action) =>
        action
          .schemas({
            inputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (
                    typeof input === "object" &&
                    input !== null &&
                    "processedText" in input &&
                    "operation" in input
                  ) {
                    return { value: input };
                  }
                  return {
                    issues: [{ message: "Invalid processed result", path: [] }],
                  };
                },
              },
              "~validate": function (input: unknown) {
                return this["~standard"].validate(input);
              },
            } as const,
          })
          .handler(async ({ input }) => {
            const processed = input as any;

            return {
              finalResult: processed.processedText.toUpperCase(),
              metadata: {
                originalOperation: processed.operation,
                textLength: processed.processedText.length,
                wasRepeated: processed.operation === "repeat",
                involvedUser: processed.user.name,
              },
            };
          }),
      );

      // Test successful bind args processing chain
      const processorResult = await bindArgsProcessor(
        3,
        { name: "Bob", age: 30 },
        "repeat",
        "Hello",
      );

      expect(processorResult.success).toBe(true);
      if (!processorResult.success) return;

      const consumerResult = await resultConsumer(processorResult.data);
      expect(consumerResult.success).toBe(true);
      if (consumerResult.success) {
        expect(consumerResult.data.finalResult).toBe("HELLOHELLOHELLO");
        expect(consumerResult.data.metadata.originalOperation).toBe("repeat");
        expect(consumerResult.data.metadata.wasRepeated).toBe(true);
        expect(consumerResult.data.metadata.involvedUser).toBe("Bob");
      }

      // Test bind args validation failure
      const invalidBindArgsResult = await bindArgsProcessor(
        NaN, // Should be number but invalid
        { name: "Bob", age: 30 },
        "repeat",
        "Hello",
      );

      expect(invalidBindArgsResult.success).toBe(false);
      if (!invalidBindArgsResult.success) {
        expect((invalidBindArgsResult.error as any).type).toBe(
          "BIND_ARGS_VALIDATION",
        );
      }
    });

    it("should handle output schema validation in component chains", async () => {
      // Component with strict output validation
      const strictOutputAction = craft((action) =>
        action
          .schemas({
            inputSchema: numberSchema,
            outputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (
                    typeof input === "object" &&
                    input !== null &&
                    "value" in input &&
                    "isPositive" in input &&
                    typeof (input as any).value === "number" &&
                    typeof (input as any).isPositive === "boolean"
                  ) {
                    return { value: input };
                  }
                  return {
                    issues: [{ message: "Invalid output format", path: [] }],
                  };
                },
              },
              "~validate": function (input: unknown) {
                return this["~standard"].validate(input);
              },
            } as const,
          })
          .handler(async ({ input }) => {
            const num = input as number;
            return {
              value: Math.abs(num),
              isPositive: num >= 0,
            };
          }),
      );

      // Component that consumes validated output
      const outputConsumer = craft((action) =>
        action
          .schemas({
            inputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (
                    typeof input === "object" &&
                    input !== null &&
                    "success" in input
                  ) {
                    return { value: input };
                  }
                  return {
                    issues: [{ message: "Expected action result", path: [] }],
                  };
                },
              },
              "~validate": function (input: unknown) {
                return this["~standard"].validate(input);
              },
            } as const,
          })
          .handler(async ({ input }) => {
            const result = input as any;
            if (!result.success) {
              throw new Error("Cannot process failed result");
            }

            const data = result.data;
            return {
              consumedValue: data.value * 2,
              wasPositive: data.isPositive,
              processingChain: "output-validated",
            };
          }),
      );

      // Test successful output validation chain
      const strictResult = await strictOutputAction(42);
      expect(strictResult.success).toBe(true);

      const consumedResult = await outputConsumer(strictResult);
      expect(consumedResult.success).toBe(true);
      if (consumedResult.success) {
        expect(consumedResult.data.consumedValue).toBe(84); // abs(42) * 2
        expect(consumedResult.data.wasPositive).toBe(true);
        expect(consumedResult.data.processingChain).toBe("output-validated");
      }
    });
  });

  describe("Configuration inheritance and overrides", () => {
    it("should handle configuration inheritance in component composition", async () => {
      // Base configuration
      const baseConfig = {
        validationErrorFormat: "nested" as const,
        resultFormat: "api" as const,
        handleThrownError: (error: unknown) =>
          ({
            type: "BASE_ERROR",
            message: error instanceof Error ? error.message : "Base error",
          }) as const,
      };

      // Component with base config
      const baseComponent = craft((action) =>
        action
          .config(baseConfig)
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "throw") {
              throw new Error("Base component error");
            }
            return `base-${input}`;
          }),
      );

      // Component that overrides some config
      const overrideComponent = craft((action) =>
        action
          .config({
            ...baseConfig,
            resultFormat: "functional" as const,
            handleThrownError: (error: unknown) =>
              ({
                type: "OVERRIDE_ERROR",
                message:
                  error instanceof Error ? error.message : "Override error",
                source: "override-component",
              }) as const,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "throw") {
              throw new Error("Override component error");
            }
            return `override-${input}`;
          }),
      );

      // Test base component behavior
      const baseResult = await baseComponent("test");
      expect(baseResult).toEqual({
        success: true,
        data: "base-test",
        __ac_id: expect.any(String),
      });

      const baseErrorResult = await baseComponent("throw");
      expect(baseErrorResult.success).toBe(false);
      if (!baseErrorResult.success) {
        expect((baseErrorResult.error as any).type).toBe("BASE_ERROR");
      }

      // Test override component behavior
      const overrideResult = await overrideComponent("test");
      expect(isOk(overrideResult)).toBe(true);
      if (isOk(overrideResult)) {
        expect(overrideResult.value).toBe("override-test");
      }

      const overrideErrorResult = await overrideComponent("throw");
      expect(isErr(overrideErrorResult)).toBe(true);
      if (isErr(overrideErrorResult)) {
        expect(overrideErrorResult.error.type).toBe("OVERRIDE_ERROR");
        expect((overrideErrorResult.error as any).source).toBe(
          "override-component",
        );
      }
    });

    it("should handle callback configuration inheritance", async () => {
      const onStartMock = vi.fn();
      const onSuccessMock = vi.fn();
      const onErrorMock = vi.fn();
      const onSettledMock = vi.fn();

      // Base callbacks
      const baseCallbacks = {
        onStart: onStartMock,
        onSuccess: onSuccessMock,
        onSettled: onSettledMock,
      };

      // Component factory with shared callbacks
      const createComponentWithCallbacks = (
        name: string,
        additionalCallbacks = {},
      ) =>
        craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .handler(async ({ input }) => {
              if (input === "error") {
                throw new Error(`${name} error`);
              }
              return `${name}-${input}`;
            })
            .callbacks({
              ...baseCallbacks,
              ...additionalCallbacks,
            }),
        );

      const component1 = createComponentWithCallbacks("comp1");
      const component2 = createComponentWithCallbacks("comp2", {
        onError: onErrorMock,
      });

      // Test component1 (no error callback)
      await component1("success");
      expect(onStartMock).toHaveBeenCalledTimes(1);
      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(onSettledMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).not.toHaveBeenCalled();

      // Reset mocks
      onStartMock.mockClear();
      onSuccessMock.mockClear();
      onErrorMock.mockClear();
      onSettledMock.mockClear();

      // Test component2 (with error callback)
      await component2("error");
      expect(onStartMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onSettledMock).toHaveBeenCalledTimes(1);
      expect(onSuccessMock).not.toHaveBeenCalled();
    });

    it("should handle useActionState configuration across components", async () => {
      // Component with useActionState enabled
      const statefulComponent = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input, metadata }) => {
            return {
              input: input as string,
              hadPrevState: !!metadata.prevState,
              prevData: metadata.prevState?.success
                ? metadata.prevState.data
                : null,
              timestamp: Date.now(),
            };
          }),
      );

      // Component without useActionState (regular)
      const regularComponent = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return `regular-${input}`;
          }),
      );

      // Test stateful component
      const initialState = initial(statefulComponent);
      const firstResult = await statefulComponent(initialState, "first");

      expect(firstResult).toEqual({
        success: true,
        data: expect.objectContaining({
          input: "first",
          hadPrevState: true,
        }),
        values: "first",
        __ac_id: expect.any(String),
      });

      const secondResult = await statefulComponent(firstResult, "second");
      expect(secondResult.success).toBe(true);
      if (secondResult.success && firstResult.success) {
        expect(secondResult.data.hadPrevState).toBe(true);
        expect(secondResult.data.prevData).toEqual(firstResult.data);
      }

      // Test regular component (should not have stateful behavior)
      const regularResult = await regularComponent("test");
      expect(regularResult).toEqual({
        success: true,
        data: "regular-test",
        __ac_id: expect.any(String),
      });
      expect("values" in regularResult).toBe(false);
    });
  });

  describe("Error handling across component boundaries", () => {
    it("should handle error transformation and propagation", async () => {
      // Error transformer component
      const errorTransformer = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            transformedError: (originalType: string, originalMessage: string) =>
              ({
                type: "TRANSFORMED_ERROR",
                originalType,
                originalMessage,
                transformedBy: "error-transformer",
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            // Simulate calling another component that might fail
            const result = await errorProducerComponent(input);

            if (!result.success) {
              const originalError = result.error as any;
              return errors.transformedError(
                originalError.type,
                originalError.message || "Unknown error",
              );
            }

            return {
              transformed: true,
              originalData: result.data,
              transformationTime: Date.now(),
            };
          }),
      );

      // Error producer component
      const errorProducerComponent = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            validationFailed: (input: string) =>
              ({
                type: "VALIDATION_FAILED",
                input,
                message: "Input validation failed",
              }) as const,
            processingFailed: (reason: string) =>
              ({
                type: "PROCESSING_FAILED",
                reason,
                message: "Processing operation failed",
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input === "invalid") {
              return errors.validationFailed(input as string);
            }

            if (input === "process-error") {
              return errors.processingFailed("simulated-failure");
            }

            return `processed-${input}`;
          }),
      );

      // Test successful transformation
      const successResult = await errorTransformer("valid");
      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.data.transformed).toBe(true);
        expect(successResult.data.originalData).toBe("processed-valid");
      }

      // Test error transformation
      const validationErrorResult = await errorTransformer("invalid");
      expect(validationErrorResult.success).toBe(false);
      if (!validationErrorResult.success) {
        expect((validationErrorResult.error as any).type).toBe(
          "TRANSFORMED_ERROR",
        );
        expect((validationErrorResult.error as any).originalType).toBe(
          "VALIDATION_FAILED",
        );
        expect((validationErrorResult.error as any).transformedBy).toBe(
          "error-transformer",
        );
      }

      const processingErrorResult = await errorTransformer("process-error");
      expect(processingErrorResult.success).toBe(false);
      if (!processingErrorResult.success) {
        expect((processingErrorResult.error as any).type).toBe(
          "TRANSFORMED_ERROR",
        );
        expect((processingErrorResult.error as any).originalType).toBe(
          "PROCESSING_FAILED",
        );
      }
    });

    it("should handle error recovery patterns across components", async () => {
      let attemptCount = 0;

      // Retry coordinator component
      const retryCoordinator = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            maxRetriesExceeded: (attempts: number, lastError: unknown) =>
              ({
                type: "MAX_RETRIES_EXCEEDED",
                attempts,
                lastError,
                suggestion: "Check system status and try again later",
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            const maxRetries = 3;
            let lastError: unknown = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              attemptCount = attempt;
              const result = await unreliableComponent(input);

              if (result.success) {
                return {
                  data: result.data,
                  attempts: attempt,
                  recovered: attempt > 1,
                  totalAttempts: attemptCount,
                };
              }

              lastError = result.error;

              // Wait before retry (except on last attempt)
              if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
            }

            return errors.maxRetriesExceeded(maxRetries, lastError);
          }),
      );

      // Unreliable component that fails first few times
      const unreliableComponent = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            temporaryFailure: (attempt: number) =>
              ({
                type: "TEMPORARY_FAILURE",
                attempt,
                message: `Temporary failure on attempt ${attempt}`,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            // Fail on first 2 attempts, succeed on 3rd
            if (attemptCount < 3) {
              return errors.temporaryFailure(attemptCount);
            }

            return `success-after-retries-${input}`;
          }),
      );

      // Test successful recovery
      attemptCount = 0;
      const recoveryResult = await retryCoordinator("test");
      expect(recoveryResult.success).toBe(true);
      if (recoveryResult.success) {
        expect(recoveryResult.data.attempts).toBe(3);
        expect(recoveryResult.data.recovered).toBe(true);
        expect(recoveryResult.data.data).toBe("success-after-retries-test");
      }

      // Test max retries exceeded (reset attempt count to simulate persistent failure)
      attemptCount = 0;
      const persistentFailureComponent = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            persistentFailure: () =>
              ({
                type: "PERSISTENT_FAILURE",
                message: "This always fails",
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.persistentFailure();
          }),
      );

      // Create a coordinator that uses the persistent failure component
      const persistentRetryCoordinator = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            maxRetriesExceeded: (attempts: number, lastError: unknown) =>
              ({
                type: "MAX_RETRIES_EXCEEDED",
                attempts,
                lastError,
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            const maxRetries = 3;
            let lastError: unknown = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              const result = await persistentFailureComponent(input);

              if (result.success) {
                return result.data;
              }

              lastError = result.error;
            }

            return errors.maxRetriesExceeded(maxRetries, lastError);
          }),
      );

      const maxRetriesResult = await persistentRetryCoordinator("test");
      expect(maxRetriesResult.success).toBe(false);
      if (!maxRetriesResult.success) {
        expect((maxRetriesResult.error as any).type).toBe(
          "MAX_RETRIES_EXCEEDED",
        );
        expect((maxRetriesResult.error as any).attempts).toBe(3);
      }
    });
  });

  describe("Action ID and metadata propagation", () => {
    it("should maintain action IDs across component interactions", async () => {
      const component1 = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input, metadata }) => {
            return {
              data: `comp1-${input}`,
              actionId: metadata.actionId,
              timestamp: Date.now(),
            };
          }),
      );

      const component2 = craft((action) =>
        action
          .schemas({
            inputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (
                    typeof input === "object" &&
                    input !== null &&
                    "success" in input
                  ) {
                    return { value: input };
                  }
                  return {
                    issues: [{ message: "Expected action result", path: [] }],
                  };
                },
              },
              "~validate": function (input: unknown) {
                return this["~standard"].validate(input);
              },
            } as const,
          })
          .handler(async ({ input, metadata }) => {
            const result = input as any;
            return {
              data: `comp2-processed`,
              originalData: result.success ? result.data : null,
              originalActionId: result.success ? result.data.actionId : null,
              currentActionId: metadata.actionId,
            };
          }),
      );

      const result1 = await component1("test");
      expect(result1.success).toBe(true);

      const actionId1 = getActionId(component1);
      expect(typeof actionId1).toBe("string");

      if (result1.success) {
        expect(result1.data.actionId).toBe(actionId1);
      }

      const result2 = await component2(result1);
      expect(result2.success).toBe(true);

      const actionId2 = getActionId(component2);
      expect(typeof actionId2).toBe("string");
      expect(actionId2).not.toBe(actionId1);

      if (result2.success) {
        expect(result2.data.originalActionId).toBe(actionId1);
        expect(result2.data.currentActionId).toBe(actionId2);
      }
    });

    it("should handle metadata propagation in useActionState workflows", async () => {
      const metadataTracker = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input, metadata }) => {
            return {
              input: input as string,
              metadata: {
                actionId: metadata.actionId,
                rawInput: metadata.rawInput,
                prevState: metadata.prevState
                  ? {
                      success: metadata.prevState.success,
                      hasData:
                        metadata.prevState.success && !!metadata.prevState.data,
                    }
                  : null,
              },
              timestamp: Date.now(),
            };
          }),
      );

      const actionId = getActionId(metadataTracker);

      // First call
      const initialState = initial(metadataTracker);
      const result1 = await metadataTracker(initialState, "first");

      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.data.metadata.actionId).toBe(actionId);
        expect(result1.data.metadata.rawInput).toBe("first");
        expect(result1.data.metadata.prevState).toEqual({
          success: false,
          hasData: false,
        });
      }

      // Second call with previous state
      const result2 = await metadataTracker(result1, "second");

      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.metadata.actionId).toBe(actionId);
        expect(result2.data.metadata.rawInput).toBe("second");
        expect(result2.data.metadata.prevState).toEqual({
          success: true,
          hasData: true,
        });
      }
    });
  });
});
