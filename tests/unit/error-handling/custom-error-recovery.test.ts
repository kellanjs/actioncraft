import { craft, initial } from "../../../src/index";
import { stringSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";
import { z } from "zod";

describe("Custom Error Types and Recovery", () => {
  describe("Comprehensive Custom Error Type Coverage", () => {
    it("should handle all possible custom error parameter combinations", async () => {
      const comprehensiveErrorAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            // No parameters
            noParamsError: () => ({
              type: "NO_PARAMS_ERROR" as const,
            }),

            // Single parameter
            singleParamError: (message: string) => ({
              type: "SINGLE_PARAM_ERROR" as const,
              message,
            }),

            // Multiple parameters
            multiParamError: (
              code: number,
              message: string,
              details: Record<string, any>,
            ) => ({
              type: "MULTI_PARAM_ERROR" as const,
              code,
              message,
              details,
            }),

            // Optional parameters
            optionalParamError: (
              message: string,
              code?: number,
              metadata?: any,
            ) => ({
              type: "OPTIONAL_PARAM_ERROR" as const,
              message,
              code: code ?? 500,
              metadata: metadata ?? {},
            }),

            // Rest parameters
            restParamError: (message: string, ...args: any[]) => ({
              type: "REST_PARAM_ERROR" as const,
              message,
              args,
              argCount: args.length,
            }),

            // Complex object parameters
            complexObjectError: (config: {
              severity: "low" | "medium" | "high" | "critical";
              category: string;
              metadata?: Record<string, any>;
              retryable?: boolean;
            }) => ({
              type: "COMPLEX_OBJECT_ERROR" as const,
              ...config,
              timestamp: Date.now(),
            }),
          })
          .handler(async ({ input, errors }) => {
            switch (input) {
              case "no-params":
                return errors.noParamsError();

              case "single-param":
                return errors.singleParamError("Single parameter test");

              case "multi-param":
                return errors.multiParamError(400, "Multi parameter test", {
                  userId: "123",
                });

              case "optional-param-minimal":
                return errors.optionalParamError("Minimal optional params");

              case "optional-param-full":
                return errors.optionalParamError("Full optional params", 404, {
                  extra: "data",
                });

              case "rest-param":
                return errors.restParamError("Rest params test", "arg1", 42, {
                  nested: true,
                });

              case "complex-object":
                return errors.complexObjectError({
                  severity: "critical",
                  category: "system",
                  metadata: { component: "database" },
                  retryable: false,
                });

              default:
                return "success";
            }
          }),
      );

      // Test no parameters
      const noParamsResult = await comprehensiveErrorAction("no-params");
      expect(noParamsResult.success).toBe(false);
      if (!noParamsResult.success) {
        expect(noParamsResult.error.type).toBe("NO_PARAMS_ERROR");
      }

      // Test single parameter
      const singleParamResult = await comprehensiveErrorAction("single-param");
      expect(singleParamResult.success).toBe(false);
      if (!singleParamResult.success) {
        expect(singleParamResult.error.type).toBe("SINGLE_PARAM_ERROR");
        expect((singleParamResult.error as any).message).toBe(
          "Single parameter test",
        );
      }

      // Test multiple parameters
      const multiParamResult = await comprehensiveErrorAction("multi-param");
      expect(multiParamResult.success).toBe(false);
      if (!multiParamResult.success) {
        expect(multiParamResult.error.type).toBe("MULTI_PARAM_ERROR");
        expect((multiParamResult.error as any).code).toBe(400);
        expect((multiParamResult.error as any).details.userId).toBe("123");
      }

      // Test optional parameters (minimal)
      const optionalMinimalResult = await comprehensiveErrorAction(
        "optional-param-minimal",
      );
      expect(optionalMinimalResult.success).toBe(false);
      if (!optionalMinimalResult.success) {
        expect(optionalMinimalResult.error.type).toBe("OPTIONAL_PARAM_ERROR");
        expect((optionalMinimalResult.error as any).code).toBe(500); // Default value
        expect((optionalMinimalResult.error as any).metadata).toEqual({});
      }

      // Test optional parameters (full)
      const optionalFullResult = await comprehensiveErrorAction(
        "optional-param-full",
      );
      expect(optionalFullResult.success).toBe(false);
      if (!optionalFullResult.success) {
        expect(optionalFullResult.error.type).toBe("OPTIONAL_PARAM_ERROR");
        expect((optionalFullResult.error as any).code).toBe(404);
        expect((optionalFullResult.error as any).metadata.extra).toBe("data");
      }

      // Test rest parameters
      const restParamResult = await comprehensiveErrorAction("rest-param");
      expect(restParamResult.success).toBe(false);
      if (!restParamResult.success) {
        expect(restParamResult.error.type).toBe("REST_PARAM_ERROR");
        expect((restParamResult.error as any).argCount).toBe(3);
        expect((restParamResult.error as any).args).toEqual([
          "arg1",
          42,
          { nested: true },
        ]);
      }

      // Test complex object parameters
      const complexObjectResult =
        await comprehensiveErrorAction("complex-object");
      expect(complexObjectResult.success).toBe(false);
      if (!complexObjectResult.success) {
        expect(complexObjectResult.error.type).toBe("COMPLEX_OBJECT_ERROR");
        expect((complexObjectResult.error as any).severity).toBe("critical");
        expect((complexObjectResult.error as any).category).toBe("system");
        expect((complexObjectResult.error as any).retryable).toBe(false);
        expect(typeof (complexObjectResult.error as any).timestamp).toBe(
          "number",
        );
      }
    });

    it("should handle generic and conditional error types", async () => {
      const genericErrorAction = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              errorType: z.string(),
              payload: z.any(),
            }),
          })
          .errors({
            genericError: <T>(
              type: string,
              payload: T,
              condition?: boolean,
            ) => ({
              type: "GENERIC_ERROR" as const,
              errorType: type,
              payload,
              conditional: condition ?? false,
              timestamp: Date.now(),
            }),

            conditionalError: (
              shouldIncludeDetails: boolean,
              message: string,
              details?: any,
            ) => {
              const baseError = {
                type: "CONDITIONAL_ERROR" as const,
                message,
              };

              return shouldIncludeDetails && details
                ? { ...baseError, details }
                : baseError;
            },
          })
          .handler(async ({ input, errors }) => {
            if (input.errorType === "generic") {
              return errors.genericError(input.errorType, input.payload, true);
            }

            if (input.errorType === "conditional-with-details") {
              return errors.conditionalError(true, "Conditional error", {
                extra: "info",
              });
            }

            if (input.errorType === "conditional-without-details") {
              return errors.conditionalError(false, "Conditional error", {
                extra: "info",
              });
            }

            return "success";
          }),
      );

      // Test generic error
      const genericResult = await genericErrorAction({
        errorType: "generic",
        payload: { data: "test", number: 42 },
      });

      expect(genericResult.success).toBe(false);
      if (!genericResult.success) {
        expect(genericResult.error.type).toBe("GENERIC_ERROR");
        expect((genericResult.error as any).errorType).toBe("generic");
        expect((genericResult.error as any).payload.data).toBe("test");
        expect((genericResult.error as any).conditional).toBe(true);
      }

      // Test conditional error with details
      const conditionalWithResult = await genericErrorAction({
        errorType: "conditional-with-details",
        payload: {},
      });

      expect(conditionalWithResult.success).toBe(false);
      if (!conditionalWithResult.success) {
        expect(conditionalWithResult.error.type).toBe("CONDITIONAL_ERROR");
        expect("details" in conditionalWithResult.error).toBe(true);
        expect((conditionalWithResult.error as any).details.extra).toBe("info");
      }

      // Test conditional error without details
      const conditionalWithoutResult = await genericErrorAction({
        errorType: "conditional-without-details",
        payload: {},
      });

      expect(conditionalWithoutResult.success).toBe(false);
      if (!conditionalWithoutResult.success) {
        expect(conditionalWithoutResult.error.type).toBe("CONDITIONAL_ERROR");
        expect("details" in conditionalWithoutResult.error).toBe(false);
      }
    });
  });

  describe("Error Recovery Strategies", () => {
    it("should implement exponential backoff recovery strategy", async () => {
      let attemptCount = 0;
      const baseDelay = 100;
      const maxRetries = 4;

      const backoffAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            backoffError: (
              attempt: number,
              nextRetryDelay: number,
              totalDelay: number,
            ) => ({
              type: "BACKOFF_ERROR" as const,
              attempt,
              nextRetryDelay,
              totalDelay,
              retryable: attempt < maxRetries,
              strategy: "exponential_backoff",
            }),
            maxAttemptsError: (totalAttempts: number, totalTime: number) => ({
              type: "MAX_ATTEMPTS_ERROR" as const,
              totalAttempts,
              totalTime,
              retryable: false,
            }),
          })
          .handler(async ({ input, errors }) => {
            attemptCount++;
            const delay = baseDelay * Math.pow(2, attemptCount - 1);
            const totalDelay = baseDelay * (Math.pow(2, attemptCount) - 1);

            if (input === "fail-with-backoff" && attemptCount <= maxRetries) {
              return errors.backoffError(attemptCount, delay * 2, totalDelay);
            }

            if (input === "fail-max-attempts" && attemptCount > maxRetries) {
              return errors.maxAttemptsError(attemptCount, totalDelay);
            }

            return `Success after ${attemptCount} attempts`;
          }),
      );

      // Test exponential backoff progression
      attemptCount = 0;
      const backoffResults: any[] = [];

      for (let i = 1; i <= maxRetries; i++) {
        const result = await backoffAction("fail-with-backoff");
        expect(result.success).toBe(false);

        if (!result.success) {
          backoffResults.push(result.error);
          expect(result.error.type).toBe("BACKOFF_ERROR");
          expect((result.error as any).attempt).toBe(i);
          expect((result.error as any).nextRetryDelay).toBe(
            baseDelay * Math.pow(2, i),
          );
        }
      }

      // Verify exponential progression
      for (let i = 1; i < backoffResults.length; i++) {
        expect(backoffResults[i].nextRetryDelay).toBe(
          backoffResults[i - 1].nextRetryDelay * 2,
        );
      }

      // Test max attempts exceeded
      const maxAttemptsResult = await backoffAction("fail-max-attempts");
      expect(maxAttemptsResult.success).toBe(false);
      if (!maxAttemptsResult.success) {
        expect(maxAttemptsResult.error.type).toBe("MAX_ATTEMPTS_ERROR");
        expect((maxAttemptsResult.error as any).retryable).toBe(false);
      }
    });

    it("should implement bulkhead pattern for error isolation", async () => {
      const resourcePools = {
        database: { available: 3, total: 3 },
        api: { available: 2, total: 2 },
        cache: { available: 1, total: 1 },
      };

      const bulkheadAction = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              resource: z.enum(["database", "api", "cache"]),
              operation: z.string(),
            }),
          })
          .errors({
            resourceExhausted: (
              resource: string,
              available: number,
              total: number,
            ) => ({
              type: "RESOURCE_EXHAUSTED" as const,
              resource,
              available,
              total,
              utilizationPercent: ((total - available) / total) * 100,
            }),
            operationFailed: (
              resource: string,
              operation: string,
              reason: string,
            ) => ({
              type: "OPERATION_FAILED" as const,
              resource,
              operation,
              reason,
            }),
          })
          .handler(async ({ input, errors }) => {
            const pool = resourcePools[input.resource];

            if (pool.available <= 0) {
              return errors.resourceExhausted(
                input.resource,
                pool.available,
                pool.total,
              );
            }

            // Simulate resource acquisition
            pool.available--;

            try {
              if (input.operation === "fail") {
                throw new Error("Simulated operation failure");
              }

              // Simulate work
              await new Promise((resolve) => setTimeout(resolve, 10));

              return `${input.operation} completed on ${input.resource}`;
            } catch (error) {
              return errors.operationFailed(
                input.resource,
                input.operation,
                error instanceof Error ? error.message : String(error),
              );
            } finally {
              // Release resource
              pool.available++;
            }
          }),
      );

      // Exhaust database pool
      const dbOperations: Promise<any>[] = [];
      for (let i = 0; i < 4; i++) {
        dbOperations.push(
          bulkheadAction({ resource: "database", operation: `op-${i}` }),
        );
      }

      const dbResults = await Promise.all(dbOperations);

      // First 3 should succeed, 4th should fail with resource exhausted
      expect(dbResults.slice(0, 3).every((r: any) => r.success)).toBe(true);
      expect(dbResults[3].success).toBe(false);

      if (!dbResults[3].success) {
        expect(dbResults[3].error.type).toBe("RESOURCE_EXHAUSTED");
        expect((dbResults[3].error as any).resource).toBe("database");
        expect((dbResults[3].error as any).available).toBe(0);
      }

      // API pool should still be available
      const apiResult = await bulkheadAction({
        resource: "api",
        operation: "test",
      });
      expect(apiResult.success).toBe(true);
    });

    it("should implement graceful degradation with fallback mechanisms", async () => {
      const serviceHealth = {
        primary: true,
        secondary: true,
        cache: true,
      };

      const fallbackAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            degradedService: (
              primaryFailed: boolean,
              secondaryFailed: boolean,
              cacheFailed: boolean,
              fallbackUsed: string,
            ) => ({
              type: "DEGRADED_SERVICE" as const,
              primaryFailed,
              secondaryFailed,
              cacheFailed,
              fallbackUsed,
              serviceLevel: "degraded",
            }),
            allServicesFailed: (attempts: string[]) => ({
              type: "ALL_SERVICES_FAILED" as const,
              attempts,
              serviceLevel: "unavailable",
            }),
          })
          .handler(async ({ input, errors }) => {
            const attempts: string[] = [];

            // Try primary service
            if (serviceHealth.primary && input !== "fail-primary") {
              attempts.push("primary");
              return { data: "primary-data", source: "primary" };
            }
            attempts.push("primary-failed");

            // Try secondary service
            if (
              serviceHealth.secondary &&
              input !== "fail-secondary" &&
              input !== "fail-cache"
            ) {
              attempts.push("secondary");
              return errors.degradedService(true, false, false, "secondary");
            }
            attempts.push("secondary-failed");

            // Try cache fallback
            if (serviceHealth.cache && input !== "fail-cache") {
              attempts.push("cache");
              return errors.degradedService(true, true, false, "cache");
            }
            attempts.push("cache-failed");

            // All services failed
            return errors.allServicesFailed(attempts);
          }),
      );

      // Test primary service success
      const primaryResult = await fallbackAction("success");
      expect(primaryResult.success).toBe(true);
      if (primaryResult.success) {
        expect((primaryResult.data as any).source).toBe("primary");
      }

      // Test fallback to secondary
      const secondaryResult = await fallbackAction("fail-primary");
      expect(secondaryResult.success).toBe(false);
      if (!secondaryResult.success) {
        expect(secondaryResult.error.type).toBe("DEGRADED_SERVICE");
        expect((secondaryResult.error as any).fallbackUsed).toBe("secondary");
        expect((secondaryResult.error as any).primaryFailed).toBe(true);
        expect((secondaryResult.error as any).secondaryFailed).toBe(false);
      }

      // Test successful fallback to secondary
      const secondaryFallbackResult = await fallbackAction("fail-primary");
      expect(secondaryFallbackResult.success).toBe(false);
      if (!secondaryFallbackResult.success) {
        expect(secondaryFallbackResult.error.type).toBe("DEGRADED_SERVICE");
        expect((secondaryFallbackResult.error as any).fallbackUsed).toBe(
          "secondary",
        );
        expect((secondaryFallbackResult.error as any).primaryFailed).toBe(true);
        expect((secondaryFallbackResult.error as any).secondaryFailed).toBe(
          false,
        );
      }
    });
  });

  describe("Error Recovery with State Management", () => {
    it("should implement stateful error recovery with useActionState", async () => {
      const recoveryAction = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .errors({
            recoverableError: (
              attempt: number,
              canRecover: boolean,
              state?: any,
            ) => ({
              type: "RECOVERABLE_ERROR" as const,
              attempt,
              canRecover,
              previousState: state,
            }),
            recoverySuccess: (attempt: number, recoveredFrom: any) => ({
              type: "RECOVERY_SUCCESS" as const,
              attempt,
              recoveredFrom,
            }),
          })
          .handler(async ({ input, errors, metadata }) => {
            const prevState = metadata.prevState;
            let attempt = 1;

            if (
              prevState &&
              !prevState.success &&
              (prevState.error as any).type === "RECOVERABLE_ERROR"
            ) {
              attempt = (prevState.error as any).attempt + 1;
            }

            if (input === "recover" && attempt <= 3) {
              if (attempt === 3) {
                return errors.recoverySuccess(
                  attempt,
                  (prevState as any)?.error,
                );
              }
              return errors.recoverableError(attempt, true, prevState);
            }

            if (input === "no-recover") {
              return errors.recoverableError(attempt, false);
            }

            return `Success on attempt ${attempt}`;
          }),
      );

      // Test recovery progression
      let state = initial(recoveryAction);

      // First attempt - should fail
      state = await recoveryAction(state, "recover");
      expect(state.success).toBe(false);
      if (!state.success) {
        expect(state.error.type).toBe("RECOVERABLE_ERROR");
        expect((state.error as any).attempt).toBe(1);
        expect((state.error as any).canRecover).toBe(true);
      }

      // Second attempt - should still fail
      state = await recoveryAction(state, "recover");
      expect(state.success).toBe(false);
      if (!state.success) {
        expect(state.error.type).toBe("RECOVERABLE_ERROR");
        expect((state.error as any).attempt).toBe(2);
      }

      // Third attempt - should recover
      state = await recoveryAction(state, "recover");
      expect(state.success).toBe(false); // Still an error, but recovery success error
      if (!state.success) {
        expect(state.error.type).toBe("RECOVERY_SUCCESS");
        expect((state.error as any).attempt).toBe(3);
        expect((state.error as any).recoveredFrom.type).toBe(
          "RECOVERABLE_ERROR",
        );
      }
    });

    it("should handle error recovery with complex state transitions", async () => {
      type RecoveryState =
        | "initial"
        | "retrying"
        | "degraded"
        | "recovered"
        | "failed";

      const stateTransitionAction = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .errors({
            stateTransitionError: (
              currentState: RecoveryState,
              nextState: RecoveryState,
              transitionReason: string,
              metadata: Record<string, any>,
            ) => ({
              type: "STATE_TRANSITION_ERROR" as const,
              currentState,
              nextState,
              transitionReason,
              metadata,
              timestamp: Date.now(),
            }),
          })
          .handler(async ({ input, errors, metadata }) => {
            const prevState = metadata.prevState;
            let currentState: RecoveryState = "initial";
            let attemptCount = 0;

            if (
              prevState &&
              !prevState.success &&
              (prevState.error as any).type === "STATE_TRANSITION_ERROR"
            ) {
              currentState = (prevState.error as any).nextState;
              attemptCount =
                (prevState.error as any).metadata.attemptCount || 0;
            }

            attemptCount++;

            let nextState: RecoveryState;
            if (currentState === "initial") {
              nextState = "retrying";
            } else if (currentState === "retrying") {
              nextState = attemptCount >= 3 ? "degraded" : "retrying";
            } else if (currentState === "degraded") {
              nextState = "recovered";
            } else {
              nextState = "initial";
            }

            if (input === "transition" && nextState !== "recovered") {
              return errors.stateTransitionError(
                currentState,
                nextState,
                `Transitioning from ${currentState} to ${nextState}`,
                { attemptCount, input },
              );
            }

            return {
              state: nextState,
              attempts: attemptCount,
              recovered: nextState === "recovered",
            };
          }),
      );

      let state = initial(stateTransitionAction);
      const transitions: string[] = [];

      // Follow state transition chain
      for (let i = 0; i < 6; i++) {
        state = await stateTransitionAction(state, "transition");

        if (!state.success) {
          transitions.push(
            `${(state.error as any).currentState} -> ${(state.error as any).nextState}`,
          );
        } else {
          transitions.push(`recovered: ${(state.data as any).recovered}`);
          break;
        }
      }

      expect(transitions).toContain("initial -> retrying");
      expect(transitions).toContain("retrying -> degraded");
      // Verify we have at least 3 transitions showing the progression
      expect(transitions.length).toBeGreaterThanOrEqual(3);
    });
  });
});
