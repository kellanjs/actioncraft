import {
  actioncraft,
  ActioncraftError,
  isActioncraftError,
} from "../../../src/index";
import {
  stringSchema,
  userSchema,
  validUserData,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Enhanced Error Propagation", () => {
  describe("Error Propagation Through Action Chain", () => {
    it("should propagate errors through nested action calls", async () => {
      const innerAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          innerError: (message: string) => ({
            type: "INNER_ERROR" as const,
            message,
            source: "inner",
          }),
        })
        .handler(async ({ input, errors }) => {
          if (input === "fail-inner") {
            return errors.innerError("Inner action failed");
          }
          return `inner-${input}`;
        })
        .build();

      const outerAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          outerError: (message: string, innerError?: any) => ({
            type: "OUTER_ERROR" as const,
            message,
            source: "outer",
            innerError,
          }),
        })
        .handler(async ({ input, errors }) => {
          const innerResult = await innerAction(input);

          if (!innerResult.success) {
            return errors.outerError(
              "Outer action failed due to inner error",
              innerResult.error,
            );
          }

          return `outer-${innerResult.data}`;
        })
        .build();

      // Test successful propagation
      const successResult = await outerAction("test");
      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.data).toBe("outer-inner-test");
      }

      // Test error propagation
      const errorResult = await outerAction("fail-inner");
      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error.type).toBe("OUTER_ERROR");
        expect(errorResult.error.message).toBe(
          "Outer action failed due to inner error",
        );
        // @ts-expect-error - Testing error structure
        expect(errorResult.error.innerError.type).toBe("INNER_ERROR");
        // @ts-expect-error - Testing error structure
        expect(errorResult.error.innerError.source).toBe("inner");
      }
    });

    it("should preserve error context through multiple validation layers", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: z.object({
            user: userSchema,
            metadata: z.object({
              requestId: z.string(),
              timestamp: z.number(),
            }),
          }),
        })
        .errors({
          contextualError: (context: string, details: Record<string, any>) => ({
            type: "CONTEXTUAL_ERROR" as const,
            context,
            details,
            timestamp: Date.now(),
          }),
        })
        .handler(async ({ input, errors }) => {
          // Simulate business logic that needs context
          if (input.user.age < 21) {
            return errors.contextualError("age_restriction", {
              userId: input.user.email,
              requestId: input.metadata.requestId,
              requiredAge: 21,
              actualAge: input.user.age,
            });
          }

          return { success: true, userId: input.user.email };
        })
        .build();

      const testInput = {
        user: { ...validUserData, age: 20 },
        metadata: {
          requestId: "req-123",
          timestamp: Date.now(),
        },
      };

      const result = await action(testInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("CONTEXTUAL_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.context).toBe("age_restriction");
        // @ts-expect-error - Testing error structure
        expect(result.error.details.requestId).toBe("req-123");
        // @ts-expect-error - Testing error structure
        expect(result.error.details.actualAge).toBe(20);
        // @ts-expect-error - Testing error structure
        expect(result.error.details.requiredAge).toBe(21);
      }
    });

    it("should handle error propagation with different result formats", async () => {
      const functionalAction = actioncraft()
        .config({ resultFormat: "functional" })
        .errors({
          functionalError: (code: number) => ({
            type: "FUNCTIONAL_ERROR" as const,
            code,
          }),
        })
        .handler(async ({ errors }) => {
          return errors.functionalError(404);
        })
        .build();

      const apiAction = actioncraft()
        .errors({
          apiError: (message: string, functionalError?: any) => ({
            type: "API_ERROR" as const,
            message,
            originalError: functionalError,
          }),
        })
        .handler(async ({ errors }) => {
          const functionalResult = await functionalAction();

          if (functionalResult.type === "err") {
            return errors.apiError("API call failed", functionalResult.error);
          }

          return "success";
        })
        .build();

      const result = await apiAction();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("API_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.originalError.type).toBe("FUNCTIONAL_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.originalError.code).toBe(404);
      }
    });
  });

  describe("Error Recovery Mechanisms", () => {
    it("should implement retry logic with error recovery", async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      const retryableAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          retryableError: (attempt: number, maxAttempts: number) => ({
            type: "RETRYABLE_ERROR" as const,
            attempt,
            maxAttempts,
            retryable: attempt < maxAttempts,
          }),
          maxRetriesExceeded: (attempts: number) => ({
            type: "MAX_RETRIES_EXCEEDED" as const,
            attempts,
            retryable: false,
          }),
        })
        .handler(async ({ input, errors }) => {
          attemptCount++;

          if (input === "fail-twice" && attemptCount <= 2) {
            return errors.retryableError(attemptCount, maxRetries);
          }

          if (input === "always-fail") {
            if (attemptCount <= maxRetries) {
              return errors.retryableError(attemptCount, maxRetries);
            }
            return errors.maxRetriesExceeded(attemptCount);
          }

          return `Success on attempt ${attemptCount}`;
        })
        .build();

      // Test successful retry
      attemptCount = 0;
      let result = await retryableAction("fail-twice");
      expect(result.success).toBe(false);

      result = await retryableAction("fail-twice");
      expect(result.success).toBe(false);

      result = await retryableAction("fail-twice");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Success on attempt 3");
      }

      // Test max retries exceeded
      attemptCount = 0;
      for (let i = 1; i <= maxRetries; i++) {
        result = await retryableAction("always-fail");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe("RETRYABLE_ERROR");
          // @ts-expect-error - Testing error structure
          expect(result.error.attempt).toBe(i);
        }
      }

      result = await retryableAction("always-fail");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("MAX_RETRIES_EXCEEDED");
        // @ts-expect-error - Testing error structure
        expect(result.error.attempts).toBe(4);
      }
    });

    it("should implement circuit breaker pattern for error recovery", async () => {
      let failureCount = 0;
      let circuitOpen = false;
      const failureThreshold = 3;
      const resetTimeout = 100; // ms

      const circuitBreakerAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          circuitOpen: () => ({
            type: "CIRCUIT_OPEN" as const,
            message: "Circuit breaker is open",
            retryAfter: resetTimeout,
          }),
          serviceUnavailable: (failures: number) => ({
            type: "SERVICE_UNAVAILABLE" as const,
            failures,
            threshold: failureThreshold,
          }),
        })
        .handler(async ({ input, errors }) => {
          if (circuitOpen) {
            return errors.circuitOpen();
          }

          if (input === "fail") {
            failureCount++;
            if (failureCount >= failureThreshold) {
              circuitOpen = true;
              setTimeout(() => {
                circuitOpen = false;
                failureCount = 0;
              }, resetTimeout);
            }
            return errors.serviceUnavailable(failureCount);
          }

          // Reset on success
          failureCount = 0;
          return "Service available";
        })
        .build();

      // Trigger failures to open circuit
      for (let i = 1; i <= failureThreshold; i++) {
        const result = await circuitBreakerAction("fail");
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe("SERVICE_UNAVAILABLE");
          // @ts-expect-error - Testing error structure
          expect(result.error.failures).toBe(i);
        }
      }

      // Circuit should now be open
      const circuitOpenResult = await circuitBreakerAction("fail");
      expect(circuitOpenResult.success).toBe(false);
      if (!circuitOpenResult.success) {
        expect(circuitOpenResult.error.type).toBe("CIRCUIT_OPEN");
      }

      // Wait for circuit to reset
      await new Promise((resolve) => setTimeout(resolve, resetTimeout + 10));

      // Circuit should be closed again
      const recoveryResult = await circuitBreakerAction("success");
      expect(recoveryResult.success).toBe(true);
    });

    it("should handle graceful degradation on partial failures", async () => {
      const degradedAction = actioncraft()
        .schemas({ inputSchema: z.array(stringSchema) })
        .errors({
          partialFailure: (
            successful: string[],
            failed: Array<{ item: string; error: string }>,
          ) => ({
            type: "PARTIAL_FAILURE" as const,
            successful,
            failed,
            degraded: true,
          }),
        })
        .handler(async ({ input, errors }) => {
          const successful: string[] = [];
          const failed: Array<{ item: string; error: string }> = [];

          for (const item of input) {
            if (item.startsWith("fail-")) {
              failed.push({
                item,
                error: `Processing failed for ${item}`,
              });
            } else {
              successful.push(`processed-${item}`);
            }
          }

          if (failed.length > 0 && successful.length > 0) {
            return errors.partialFailure(successful, failed);
          }

          if (failed.length > 0) {
            throw new Error("All items failed");
          }

          return successful;
        })
        .build();

      const mixedInput = ["item1", "fail-item2", "item3", "fail-item4"];
      const result = await degradedAction(mixedInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("PARTIAL_FAILURE");
        // @ts-expect-error - Testing error structure
        expect(result.error.successful).toEqual([
          "processed-item1",
          "processed-item3",
        ]);
        // @ts-expect-error - Testing error structure
        expect(result.error.failed).toHaveLength(2);
        // @ts-expect-error - Testing error structure
        expect(result.error.degraded).toBe(true);
      }
    });
  });

  describe("Error Context Preservation", () => {
    it("should preserve error context across callback chains", async () => {
      const contextData: any[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          contextError: (phase: string, context: Record<string, any>) => ({
            type: "CONTEXT_ERROR" as const,
            phase,
            context,
          }),
        })
        .handler(async ({ input, errors, metadata }) => {
          if (input === "fail") {
            return errors.contextError("handler", {
              actionId: metadata.actionId,
              actionName: metadata.actionName,
              timestamp: Date.now(),
            });
          }
          return "success";
        })
        .callbacks({
          onStart: async ({ metadata }) => {
            contextData.push({
              phase: "start",
              actionId: metadata.actionId,
              actionName: metadata.actionName,
            });
          },
          onError: async ({ error, metadata }) => {
            contextData.push({
              phase: "error",
              actionId: metadata.actionId,
              actionName: metadata.actionName,
              errorType: error.type,
            });
          },
          onSettled: async ({ metadata }) => {
            contextData.push({
              phase: "settled",
              actionId: metadata.actionId,
              actionName: metadata.actionName,
            });
          },
        })
        .build();

      const result = await action("fail");
      expect(result.success).toBe(false);

      // Verify context preservation across callbacks
      expect(contextData).toHaveLength(3);
      expect(contextData[0].phase).toBe("start");
      expect(contextData[1].phase).toBe("error");
      expect(contextData[2].phase).toBe("settled");

      // All should have the same action ID
      const actionId = contextData[0].actionId;
      expect(contextData.every((ctx) => ctx.actionId === actionId)).toBe(true);
    });

    it("should preserve error metadata through ActioncraftError wrapper", async () => {
      const action = actioncraft()
        .config({ actionName: "testAction" })
        .errors({
          wrappedError: (details: Record<string, any>) => ({
            type: "WRAPPED_ERROR" as const,
            details,
            timestamp: Date.now(),
          }),
        })
        .handler(async ({ errors }) => {
          return errors.wrappedError({
            userId: "user123",
            operation: "test",
            metadata: { source: "handler" },
          });
        })
        .build();

      const result = await action();
      expect(result.success).toBe(false);

      if (!result.success) {
        // Create ActioncraftError from result
        const actioncraftError = new ActioncraftError(
          result.error,
          result.__ac_id,
        );

        expect(isActioncraftError(actioncraftError)).toBe(true);
        expect(isActioncraftError(actioncraftError, action)).toBe(true);
        expect(actioncraftError.actionId).toBe(result.__ac_id);
        expect(actioncraftError.cause.type).toBe("WRAPPED_ERROR");
        // @ts-expect-error - Testing error structure
        expect(actioncraftError.cause.details.userId).toBe("user123");
      }
    });
  });
});
