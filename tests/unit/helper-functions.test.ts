import { initial, craft } from "../../src/index";
import {
  ok,
  err,
  isOk,
  isErr,
  isResult,
  isResultOk,
  isResultErr,
} from "../../src/types/result";
import { getActionId } from "../../src/utils";
import { describe, expect, it } from "../setup";

describe("Helper Functions", () => {
  describe("Error function definitions (for .errors() method)", () => {
    it("should create error functions that return proper error objects", () => {
      const customError = (message: string) =>
        ({
          type: "CUSTOM_ERROR",
          message,
        }) as const;

      const result = customError("Something went wrong");
      expect(result).toEqual({
        type: "CUSTOM_ERROR",
        message: "Something went wrong",
      });
      expect(result.type).toBe("CUSTOM_ERROR");
    });

    it("should work with no-argument error functions", () => {
      const simpleError = () =>
        ({
          type: "SIMPLE_ERROR",
        }) as const;

      const result = simpleError();
      expect(result).toEqual({
        type: "SIMPLE_ERROR",
      });
    });

    it("should work with complex error objects", () => {
      const complexError = (code: number, details: Record<string, unknown>) =>
        ({
          type: "COMPLEX_ERROR",
          code,
          details,
          timestamp: Date.now(),
        }) as const;

      const result = complexError(500, { userId: 123 });
      expect(result.type).toBe("COMPLEX_ERROR");
      expect(result.code).toBe(500);
      expect(result.details).toEqual({ userId: 123 });
      expect(typeof result.timestamp).toBe("number");
    });

    it("should preserve function identity and allow multiple calls", () => {
      const counterError = (count: number) =>
        ({
          type: "COUNTER_ERROR",
          count,
        }) as const;

      const result1 = counterError(1);
      const result2 = counterError(2);

      expect(result1).toEqual({ type: "COUNTER_ERROR", count: 1 });
      expect(result2).toEqual({ type: "COUNTER_ERROR", count: 2 });
    });

    it("should work with different error shapes", () => {
      const validationError = (field: string, value: unknown) =>
        ({
          type: "VALIDATION_ERROR",
          field,
          value,
          code: "INVALID_INPUT",
        }) as const;

      const networkError = (url: string, status: number) =>
        ({
          type: "NETWORK_ERROR",
          url,
          status,
          retry: true,
        }) as const;

      expect(validationError("email", "invalid-email")).toEqual({
        type: "VALIDATION_ERROR",
        field: "email",
        value: "invalid-email",
        code: "INVALID_INPUT",
      });

      expect(networkError("/api/users", 500)).toEqual({
        type: "NETWORK_ERROR",
        url: "/api/users",
        status: 500,
        retry: true,
      });
    });
  });

  describe("initial() helper", () => {
    it("should return a failure state for a fresh useActionState action", () => {
      const action = craft((action) =>
        action.config({ useActionState: true }).handler(async () => {
          return null;
        }),
      );
      const actionId = getActionId(action);
      const initialState = initial(action);

      expect(initialState).toEqual({
        success: false,
        error: {
          type: "INITIAL_STATE",
          message: "Action has not been executed yet",
        },
        values: undefined,
        __ac_id: actionId,
      });
    });

    it("should return the same structure every time for the same action", () => {
      const action = craft((action) =>
        action.config({ useActionState: true }).handler(async () => {
          return null;
        }),
      );
      const state1 = initial(action);
      const state2 = initial(action);

      expect(state1).toEqual(state2);
    });

    it("should return a consistent structure", () => {
      const action = craft((action) =>
        action.config({ useActionState: true }).handler(async () => {
          return null;
        }),
      );
      const state = initial(action);

      expect(state.success).toBe(false);
      if (!state.success) {
        expect(state.error.type).toBe("INITIAL_STATE");
        expect(state.error.message).toBe("Action has not been executed yet");
      }
      expect(typeof state).toBe("object");
      expect(state).toHaveProperty("success");
      expect(state).toHaveProperty("error");
    });

    it("should be compatible with useActionState previousState type", () => {
      const action = craft((action) =>
        action.config({ useActionState: true }).handler(async () => {
          return null;
        }),
      );
      const initialState = initial(action);

      expect(initialState.success).toBe(false);
      if (!initialState.success) {
        expect(typeof initialState.error).toBe("object");
        expect(typeof initialState.error.type).toBe("string");
        expect("message" in initialState.error).toBe(true);
      }
    });
  });

  describe("New API Integration Tests", () => {
    it("should handle raw data returns in handlers", async () => {
      const action = craft((action) =>
        action.handler(async () => {
          return { name: "John", age: 30 };
        }),
      );

      const result = await action();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: "John", age: 30 });
      }
    });

    it("should handle primitive data returns in handlers", async () => {
      const stringAction = craft((action) =>
        action.handler(async () => "hello world"),
      );

      const numberAction = craft((action) => action.handler(async () => 42));

      const booleanAction = craft((action) => action.handler(async () => true));

      const stringResult = await stringAction();
      const numberResult = await numberAction();
      const booleanResult = await booleanAction();

      expect(stringResult.success && stringResult.data).toBe("hello world");
      expect(numberResult.success && numberResult.data).toBe(42);
      expect(booleanResult.success && booleanResult.data).toBe(true);
    });

    it("should handle error function calls in handlers", async () => {
      const action = craft((action) =>
        action
          .errors({
            customError: (message: string) =>
              ({
                type: "CUSTOM_ERROR",
                message,
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.customError("Something went wrong");
          }),
      );

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "CUSTOM_ERROR",
          message: "Something went wrong",
        });
      }
    });

    it("should handle manual Result objects in handlers", async () => {
      const successAction = craft((action) =>
        action.handler(async () => {
          return ok({ data: "success" });
        }),
      );

      const errorAction = craft((action) =>
        action.handler(async () => {
          return err({ type: "MANUAL_ERROR", message: "failed" } as const);
        }),
      );

      const successResult = await successAction();
      const errorResult = await errorAction();

      expect(successResult.success && successResult.data).toEqual({
        data: "success",
      });
      expect(!errorResult.success && errorResult.error).toEqual({
        type: "MANUAL_ERROR",
        message: "failed",
      });
    });

    it("should work with mixed return types in different handlers", async () => {
      const errors = {
        validationError: (field: string) =>
          ({
            type: "VALIDATION_ERROR",
            field,
          }) as const,
      };

      // Raw data return
      const action1 = craft((action) =>
        action.errors(errors).handler(async () => ({ userId: 123 })),
      );

      // Error function return
      const action2 = craft((action) =>
        action
          .errors(errors)
          .handler(async ({ errors }) => errors.validationError("email")),
      );

      // Manual Result return
      const action3 = craft((action) =>
        action.errors(errors).handler(async () => ok("manual success")),
      );

      const [result1, result2, result3] = await Promise.all([
        action1(),
        action2(),
        action3(),
      ]);

      expect(result1.success && result1.data).toEqual({ userId: 123 });
      expect(!result2.success && result2.error.type).toBe("VALIDATION_ERROR");
      expect(result3.success && result3.data).toBe("manual success");
    });

    it("should properly handle undefined returns (implicit return error)", async () => {
      const action = craft((action) =>
        action.handler(async () => {
          // Implicit return undefined
        }),
      );

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle falsy values as valid data", async () => {
      const zeroAction = craft((action) => action.handler(async () => 0));
      const emptyStringAction = craft((action) =>
        action.handler(async () => ""),
      );
      const falseAction = craft((action) => action.handler(async () => false));
      const nullAction = craft((action) => action.handler(async () => null));
      const emptyArrayAction = craft((action) =>
        action.handler(async () => []),
      );
      const emptyObjectAction = craft((action) =>
        action.handler(async () => ({})),
      );

      const results = await Promise.all([
        zeroAction(),
        emptyStringAction(),
        falseAction(),
        nullAction(),
        emptyArrayAction(),
        emptyObjectAction(),
      ]);

      // All should be successful with their respective falsy values
      expect(results[0].success && results[0].data).toBe(0);
      expect(results[1].success && results[1].data).toBe("");
      expect(results[2].success && results[2].data).toBe(false);
      expect(results[3].success && results[3].data).toBe(null);
      expect(results[4].success && results[4].data).toEqual([]);
      expect(results[5].success && results[5].data).toEqual({});
    });

    it("should handle arrays and complex nested data", async () => {
      const arrayAction = craft((action) =>
        action.handler(async () => [1, 2, { nested: true }]),
      );

      const complexAction = craft((action) =>
        action.handler(async () => ({
          users: [
            { id: 1, name: "John" },
            { id: 2, name: "Jane" },
          ],
          meta: { total: 2, page: 1 },
          features: { admin: true, beta: false },
        })),
      );

      const arrayResult = await arrayAction();
      const complexResult = await complexAction();

      expect(arrayResult.success && arrayResult.data).toEqual([
        1,
        2,
        { nested: true },
      ]);
      expect(complexResult.success && complexResult.data).toEqual({
        users: [
          { id: 1, name: "John" },
          { id: 2, name: "Jane" },
        ],
        meta: { total: 2, page: 1 },
        features: { admin: true, beta: false },
      });
    });

    it("should handle thrown errors correctly", async () => {
      const throwingAction = craft((action) =>
        action.handler(async () => {
          throw new Error("Something went wrong");
        }),
      );

      const result = await throwingAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should not confuse malformed objects with Results", async () => {
      const malformedAction1 = craft((action) =>
        action.handler(async () => ({ type: "ok", data: "not a result" })),
      );

      const malformedAction2 = craft((action) =>
        action.handler(async () => ({ type: "err", message: "not a result" })),
      );

      const result1 = await malformedAction1();
      const result2 = await malformedAction2();

      // These should be treated as raw data, not as Results
      expect(result1.success && result1.data).toEqual({
        type: "ok",
        data: "not a result",
      });
      expect(result2.success && result2.data).toEqual({
        type: "err",
        message: "not a result",
      });

      // Object with both type and value qualifies as Result
      const pseudoResult2 = { type: "ok", value: 1 } as unknown;
      expect(isResult(pseudoResult2)).toBe(true);
      // Truly malformed object (missing required value/error) should return false
      const malformed2 = { type: "ok" } as unknown;
      expect(isResult(malformed2)).toBe(false);
    });

    it("should work with callbacks and raw data returns", async () => {
      let capturedSuccessData: unknown;
      let capturedSettledResult: unknown;

      const action = craft((action) =>
        action
          .handler(async () => {
            return { value: 42, name: "test" };
          })
          .callbacks({
            onSuccess: async ({ data }) => {
              capturedSuccessData = data;
              // This should properly infer the type
              const valueTest: number = data.value; // Should be properly typed
              expect(valueTest).toBe(42);
            },
            onSettled: async ({ result }) => {
              capturedSettledResult = result;
            },
          }),
      );

      const result = await action();

      expect(result.success).toBe(true);
      expect(capturedSuccessData).toEqual({ value: 42, name: "test" });
      expect(capturedSettledResult).toEqual({
        success: true,
        data: { value: 42, name: "test" },
        __ac_id: expect.any(String),
      });
    });

    it("should work with callbacks and error function returns", async () => {
      let capturedErrorData: unknown;
      let capturedSettledResult: unknown;

      const action = craft((action) =>
        action
          .errors({
            testError: (message: string) =>
              ({
                type: "TEST_ERROR",
                message,
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.testError("callback test");
          })
          .callbacks({
            onError: async ({ error }) => {
              capturedErrorData = error;
            },
            onSettled: async ({ result }) => {
              capturedSettledResult = result;
            },
          }),
      );

      const result = await action();

      expect(result.success).toBe(false);
      expect(capturedErrorData).toEqual({
        type: "TEST_ERROR",
        message: "callback test",
      });
      expect(capturedSettledResult).toEqual({
        success: false,
        error: { type: "TEST_ERROR", message: "callback test" },
        __ac_id: expect.any(String),
      });
    });

    it("should properly infer complex return types in callbacks", async () => {
      interface UserData {
        id: number;
        name: string;
        settings: { theme: string; notifications: boolean };
      }

      let capturedData: UserData | undefined;

      const action = craft((action) =>
        action
          .handler(async (): Promise<UserData> => {
            return {
              id: 123,
              name: "John",
              settings: { theme: "dark", notifications: true },
            };
          })
          .callbacks({
            onSuccess: async ({ data }) => {
              capturedData = data;
              // These should all be properly typed
              const idTest: number = data.id;
              const nameTest: string = data.name;
              const themeTest: string = data.settings.theme;
              const notificationsTest: boolean = data.settings.notifications;

              expect(idTest).toBe(123);
              expect(nameTest).toBe("John");
              expect(themeTest).toBe("dark");
              expect(notificationsTest).toBe(true);
            },
          }),
      );

      await action();

      expect(capturedData).toEqual({
        id: 123,
        name: "John",
        settings: { theme: "dark", notifications: true },
      });
    });

    it("should infer simple return types without explicit annotations", async () => {
      let capturedData: unknown;

      // This should work without explicit type annotations
      const action = craft((action) =>
        action
          .handler(async () => {
            return { value: 42, message: "test" };
          })
          .callbacks({
            onSuccess: async ({ data }) => {
              capturedData = data;
              // TypeScript should infer the correct shape
              expect(data.value).toBe(42);
              expect(data.message).toBe("test");
            },
          }),
      );

      await action();
      expect(capturedData).toEqual({ value: 42, message: "test" });
    });
  });

  describe("Result utility compatibility", () => {
    it("should work with Result utilities when manually creating Results", () => {
      const successResult = ok("test data");
      const errorResult = err("error message");

      expect(isOk(successResult)).toBe(true);
      expect(isErr(successResult)).toBe(false);
      expect(isOk(errorResult)).toBe(false);
      expect(isErr(errorResult)).toBe(true);

      if (isOk(successResult)) {
        expect(successResult.value).toBe("test data");
      }
      if (isErr(errorResult)) {
        expect(errorResult.error).toBe("error message");
      }
    });

    it("should correctly identify Result types with isResult utilities", () => {
      const okRes = ok(123);
      const errRes = err({ type: "TEST", message: "fail" });

      expect(isOk(okRes)).toBe(true);
      expect(isErr(okRes)).toBe(false);
      expect(isResult(okRes)).toBe(true);
      expect(isResultOk(okRes)).toBe(true);
      expect(isResultErr(okRes)).toBe(false);

      expect(isOk(errRes)).toBe(false);
      expect(isErr(errRes)).toBe(true);
      expect(isResult(errRes)).toBe(true);
      expect(isResultOk(errRes)).toBe(false);
      expect(isResultErr(errRes)).toBe(true);

      // Malformed object should return false
      const malformed2 = { type: "ok" } as unknown;
      expect(isResult(malformed2)).toBe(false);
    });
  });
});
