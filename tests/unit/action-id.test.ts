import { ActioncraftError, isActioncraftError } from "../../src/classes/error";
import { craft, initial } from "../../src/index";
import { ok, err } from "../../src/types/result";
import { getActionId } from "../../src/utils";
import { unwrap, throwable } from "../../src/utils";
import { stringSchema, numberSchema } from "../fixtures/schemas";
import { describe, it, expect } from "../setup";

describe("Action ID (__ac_id) Field", () => {
  describe("Action ID Generation and Attachment", () => {
    it("should generate unique action IDs for different actions", () => {
      const action1 = craft((action) => action.handler(async () => "test1"));

      const action2 = craft((action) => action.handler(async () => "test2"));

      const id1 = getActionId(action1);
      const id2 = getActionId(action2);

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(typeof id1).toBe("string");
      expect(typeof id2).toBe("string");
      expect(id1).not.toBe(id2);
      expect(id1!.length).toBeGreaterThan(0);
      expect(id2!.length).toBeGreaterThan(0);
    });

    it("should return the same action ID for multiple calls to getActionId", () => {
      const action = craft((action) => action.handler(async () => "test"));

      const id1 = getActionId(action);
      const id2 = getActionId(action);
      const id3 = getActionId(action);

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it("should generate valid UUID-like action IDs", () => {
      const action = craft((action) => action.handler(async () => "test"));

      const actionId = getActionId(action);
      expect(actionId).toBeDefined();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(actionId).toMatch(uuidRegex);
    });
  });

  describe("Action ID in Results - API Format", () => {
    it("should include action ID in successful API results", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => ({ message: `Hello ${input}` })),
      );

      const result = await action("World");
      const actionId = getActionId(action);

      expect(result.success).toBe(true);
      expect(result.__ac_id).toBe(actionId);
      expect(typeof result.__ac_id).toBe("string");
    });

    it("should include action ID in error API results", async () => {
      const action = craft((action) =>
        action
          .errors({
            testError: (message: string) => ({
              type: "TEST_ERROR" as const,
              message,
            }),
          })
          .handler(async ({ errors }) => errors.testError("Test error")),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      expect(typeof result.__ac_id).toBe("string");
    });

    it("should include action ID in validation error results", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      // @ts-expect-error - Testing invalid input
      const result = await action(123);
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should include action ID in unhandled error results", async () => {
      const action = craft((action) =>
        action.handler(async () => {
          throw new Error("Unhandled error");
        }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });
  });

  describe("Action ID in Results - Functional Format", () => {
    it("should include action ID in successful functional results", async () => {
      const action = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => (input as number) * 2),
      );

      const result = await action(5);
      const actionId = getActionId(action);

      expect(result.type).toBe("ok");
      expect(result.__ac_id).toBe(actionId);
      if (result.type === "ok") {
        expect(result.value).toBe(10);
      }
    });

    it("should include action ID in error functional results", async () => {
      const action = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .errors({
            functionalError: (code: number) => ({
              type: "FUNCTIONAL_ERROR" as const,
              code,
            }),
          })
          .handler(async ({ errors }) => errors.functionalError(404)),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.type).toBe("err");
      expect(result.__ac_id).toBe(actionId);
      if (result.type === "err") {
        expect(result.error.type).toBe("FUNCTIONAL_ERROR");
      }
    });

    it("should include action ID in functional validation errors", async () => {
      const action = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      // @ts-expect-error - Testing invalid input
      const result = await action(123);
      const actionId = getActionId(action);

      expect(result.type).toBe("err");
      expect(result.__ac_id).toBe(actionId);
      if (result.type === "err") {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Action ID in Results - useActionState Format", () => {
    it("should include action ID in successful useActionState results", async () => {
      const action = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => (input as string).toUpperCase()),
      );

      const result = await action(initial(action), "hello");
      const actionId = getActionId(action);

      expect(result.success).toBe(true);
      expect(result.__ac_id).toBe(actionId);
      if (result.success) {
        expect(result.data).toBe("HELLO");
        expect(result.values).toBe("hello");
      }
    });

    it("should include action ID in error useActionState results", async () => {
      const action = craft((action) =>
        action
          .config({ useActionState: true })
          .errors({
            stateError: (message: string) => ({
              type: "STATE_ERROR" as const,
              message,
            }),
          })
          .handler(async ({ errors }) => {
            return errors.stateError("State error");
          }),
      );

      const result = await action(initial(action));
      const actionId = getActionId(action as any);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("STATE_ERROR");
      }
    });

    it("should include action ID in useActionState validation errors", async () => {
      const action = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      // @ts-expect-error - Testing invalid input
      const result = await action(initial(action), 123);
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Action ID in Manual Result Objects", () => {
    it("should preserve action ID when returning manual ok() results", async () => {
      const action = craft((action) =>
        action.handler(async () => ok("manual success")),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(true);
      expect(result.__ac_id).toBe(actionId);
    });

    it("should set action ID when returning manual err() results", async () => {
      const action = craft((action) =>
        action.handler(async () => err({ type: "MANUAL_ERROR" as const })),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
    });

    it("should override unknown action ID in manual results", async () => {
      const action = craft((action) =>
        action.handler(async () =>
          err({ type: "MANUAL_ERROR" as const }, "unknown"),
        ),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      expect(result.__ac_id).not.toBe("unknown");
    });

    it("should override custom action ID with action's own ID for security", async () => {
      const action = craft((action) =>
        action.handler(async () =>
          err({ type: "MANUAL_ERROR" as const }, "custom-id"),
        ),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      // The system always uses the action's own ID for security and consistency
      expect(result.__ac_id).toBe(actionId);
      expect(result.__ac_id).not.toBe("custom-id");
    });
  });

  describe("Action ID in Initial State", () => {
    it("should use real action ID in initial state for API format", () => {
      const action = craft((action) => action.handler(async () => "test"));
      const actionId = getActionId(action);

      const initialState = initial(action);

      expect(initialState.success).toBe(false);
      expect(initialState.__ac_id).toBe(actionId);
      if (!initialState.success) {
        expect(initialState.error.type).toBe("INITIAL_STATE");
      }
    });

    it("should use real action ID in initial state for functional format", () => {
      const action = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .handler(async () => "test"),
      );
      const actionId = getActionId(action);

      const initialState = initial(action);

      expect(initialState.type).toBe("err");
      expect(initialState.__ac_id).toBe(actionId);
      if (initialState.type === "err") {
        expect(initialState.error.type).toBe("INITIAL_STATE");
      }
    });

    it("should use real action ID in initial state for useActionState format", () => {
      const action = craft((action) =>
        action.config({ useActionState: true }).handler(async () => "test"),
      );
      const actionId = getActionId(action);

      const initialState = initial(action);

      expect(initialState.success).toBe(false);
      expect(initialState.__ac_id).toBe(actionId);
      if (!initialState.success) {
        expect(initialState.error.type).toBe("INITIAL_STATE");
      }
    });
  });

  describe("Action ID in ActioncraftError", () => {
    it("should include action ID in ActioncraftError from unwrap", async () => {
      const action = craft((action) =>
        action
          .errors({
            testError: (message: string) => ({
              type: "TEST_ERROR" as const,
              message,
            }),
          })
          .handler(async ({ errors }) => errors.testError("Test error")),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(() => unwrap(result)).toThrow(ActioncraftError);

      try {
        unwrap(result);
      } catch (error) {
        expect(error).toBeInstanceOf(ActioncraftError);
        if (error instanceof ActioncraftError) {
          expect(error.actionId).toBe(actionId);
          expect(error.cause.type).toBe("TEST_ERROR");
        }
      }
    });

    it("should include action ID in ActioncraftError from throwable", async () => {
      const action = craft((action) =>
        action
          .errors({
            throwableError: (code: number) => ({
              type: "THROWABLE_ERROR" as const,
              code,
            }),
          })
          .handler(async ({ errors }) => errors.throwableError(500)),
      );

      const throwableAction = throwable(action);
      const actionId = getActionId(action);

      await expect(throwableAction()).rejects.toThrow(ActioncraftError);

      try {
        await throwableAction();
      } catch (error) {
        expect(error).toBeInstanceOf(ActioncraftError);
        if (error instanceof ActioncraftError) {
          expect(error.actionId).toBe(actionId);
          expect(error.cause.type).toBe("THROWABLE_ERROR");
        }
      }
    });

    it("should include action ID in ActioncraftError from validation failures", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      // @ts-expect-error - Testing invalid input
      const result = await action(123);
      const actionId = getActionId(action);

      expect(() => unwrap(result)).toThrow(ActioncraftError);

      try {
        unwrap(result);
      } catch (error) {
        expect(error).toBeInstanceOf(ActioncraftError);
        if (error instanceof ActioncraftError) {
          expect(error.actionId).toBe(actionId);
          expect(error.cause.type).toBe("INPUT_VALIDATION");
        }
      }
    });
  });

  describe("isActioncraftError with Action ID Verification", () => {
    it("should verify ActioncraftError belongs to specific action", async () => {
      const action1 = craft((action) =>
        action
          .errors({
            error1: () => ({ type: "ERROR_1" as const }),
          })
          .handler(async ({ errors }) => errors.error1()),
      );

      const action2 = craft((action) =>
        action
          .errors({
            error2: () => ({ type: "ERROR_2" as const }),
          })
          .handler(async ({ errors }) => errors.error2()),
      );

      const throwable1 = throwable(action1);
      const throwable2 = throwable(action2);

      let error1: unknown;
      let error2: unknown;

      try {
        await throwable1();
      } catch (e) {
        error1 = e;
      }

      try {
        await throwable2();
      } catch (e) {
        error2 = e;
      }

      // Verify errors belong to their respective actions
      expect(isActioncraftError(error1, action1)).toBe(true);
      expect(isActioncraftError(error1, action2)).toBe(false);
      expect(isActioncraftError(error2, action2)).toBe(true);
      expect(isActioncraftError(error2, action1)).toBe(false);
    });

    it("should work without action parameter for basic validation", async () => {
      const action = craft((action) =>
        action
          .errors({
            basicError: () => ({ type: "BASIC_ERROR" as const }),
          })
          .handler(async ({ errors }) => errors.basicError()),
      );

      const throwableAction = throwable(action);
      let error: unknown;

      try {
        await throwableAction();
      } catch (e) {
        error = e;
      }

      // Should work without action parameter
      expect(isActioncraftError(error)).toBe(true);
      expect(isActioncraftError(error, action)).toBe(true);
    });

    it("should handle actions without action IDs gracefully", async () => {
      const action = craft((action) =>
        action
          .errors({
            noIdError: () => ({ type: "NO_ID_ERROR" as const }),
          })
          .handler(async ({ errors }) => errors.noIdError()),
      );

      // Manually remove the action ID to simulate edge case
      delete (action as any).__ac_id;

      const throwableAction = throwable(action);
      let error: unknown;

      try {
        await throwableAction();
      } catch (e) {
        error = e;
      }

      // Should validate structure when no action provided
      expect(isActioncraftError(error)).toBe(true);
      // Should return false when action provided but can't verify relationship
      expect(isActioncraftError(error, action)).toBe(false);
    });

    it("should reject non-ActioncraftError objects", () => {
      const regularError = new Error("Regular error");
      const customError = { type: "FAKE_ERROR", message: "Fake" };
      const malformedError = new ActioncraftError({ type: "TEST" as const });
      (malformedError as any).cause = null;

      const action = craft((action) => action.handler(async () => "test"));

      expect(isActioncraftError(regularError, action)).toBe(false);
      expect(isActioncraftError(customError, action)).toBe(false);
      expect(isActioncraftError(malformedError, action)).toBe(false);
      expect(isActioncraftError(null, action)).toBe(false);
      expect(isActioncraftError(undefined, action)).toBe(false);
    });
  });

  describe("Action ID Consistency Across Execution", () => {
    it("should maintain same action ID across multiple executions", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => ({ result: input })),
      );

      const actionId = getActionId(action);

      const result1 = await action("test1");
      const result2 = await action("test2");
      const result3 = await action("test3");

      expect(result1.__ac_id).toBe(actionId);
      expect(result2.__ac_id).toBe(actionId);
      expect(result3.__ac_id).toBe(actionId);
      expect(result1.__ac_id).toBe(result2.__ac_id);
      expect(result2.__ac_id).toBe(result3.__ac_id);
    });

    it("should maintain action ID consistency in callbacks", async () => {
      const capturedActionIds: string[] = [];

      const action = craft((action) =>
        action
          .handler(async ({ metadata }) => {
            capturedActionIds.push(metadata.actionId);
            return "success";
          })
          .callbacks({
            onStart: async ({ metadata }) => {
              capturedActionIds.push(metadata.actionId);
            },
            onSuccess: async ({ metadata }) => {
              capturedActionIds.push(metadata.actionId);
            },
            onSettled: async ({ metadata }) => {
              capturedActionIds.push(metadata.actionId);
            },
          }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.__ac_id).toBe(actionId);
      expect(capturedActionIds).toHaveLength(4);
      expect(capturedActionIds.every((id) => id === actionId)).toBe(true);
    });

    it("should maintain action ID consistency with bind arguments", async () => {
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .handler(async ({ input, bindArgs, metadata }) => ({
            input,
            multiplier: bindArgs[0],
            actionId: metadata.actionId,
          })),
      );

      const result = await action(5, "test");
      const actionId = getActionId(action);

      expect(result.success).toBe(true);
      expect(result.__ac_id).toBe(actionId);
      if (result.success) {
        expect(result.data.actionId).toBe(actionId);
      }
    });
  });

  describe("Action ID Edge Cases", () => {
    it("should handle actions with complex error scenarios", async () => {
      const action = craft((action) =>
        action
          .config({
            handleThrownError: (error: unknown) => ({
              type: "CUSTOM_THROWN_ERROR" as const,
              originalError:
                error instanceof Error ? error.message : String(error),
            }),
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "throw") {
              throw new Error("Intentional error");
            }
            return input;
          }),
      );

      const thrownResult = await action("throw");
      const successResult = await action("success");
      const actionId = getActionId(action);

      expect(thrownResult.__ac_id).toBe(actionId);
      expect(successResult.__ac_id).toBe(actionId);

      if (!thrownResult.success) {
        expect(thrownResult.error.type).toBe("CUSTOM_THROWN_ERROR");
      }
    });

    it("should handle output validation failures with correct action ID", async () => {
      const action = craft(
        (action) =>
          action
            .schemas({
              inputSchema: stringSchema,
              outputSchema: numberSchema,
            })
            .handler(async ({ input }) => input), // Returns string when number expected
      );

      const result = await action("not-a-number");
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle implicit return errors with correct action ID", async () => {
      const action = craft((action) =>
        action.handler(async () => {
          // Implicit return undefined
        }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });
  });
});
