import { craft, initial } from "../../src/index";
import { stringSchema, numberSchema } from "../fixtures/schemas";
import { describe, expect, it } from "../setup";

describe("useActionState Integration", () => {
  describe("Action signature", () => {
    it("should create action with useActionState signature", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input, metadata }) => {
            // Should have access to previousState in metadata
            expect(metadata.prevState).toBeDefined();
            return (input as string).toUpperCase();
          }),
      );

      // useActionState signature: (previousState, formData)
      const initialState = initial(action);
      const result = await action(initialState, "hello");

      expect(result).toEqual({
        success: true,
        data: "HELLO",
        values: "hello",
        __ac_id: expect.any(String),
      });
    });

    it("should handle bind args with useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [multiplier] = bindArgs;
            return (input as string).repeat(multiplier as number);
          }),
      );

      // useActionState with bindArgs: (bindArg1, ..., previousState, input)
      const initialState = initial(action);
      const result = await action(3, initialState, "Hi");

      expect(result).toEqual({
        success: true,
        data: "HiHiHi",
        values: "Hi",
        __ac_id: expect.any(String),
      });
    });

    it("should handle multiple bind args with useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema, stringSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [multiplier, prefix] = bindArgs;
            const repeated = (input as string).repeat(multiplier as number);
            return `${prefix as string}${repeated}`;
          }),
      );

      const initialState = initial(action);
      const result = await action(2, "PREFIX:", initialState, "test");

      expect(result).toEqual({
        success: true,
        data: "PREFIX:testtest",
        values: "test",
        __ac_id: expect.any(String),
      });
    });

    it("should handle useActionState without input schema", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            return `Previous state success: ${metadata.prevState?.success}`;
          }),
      );

      const previousState = {
        success: true,
        data: "previous data",
      } as const;

      const result = await action(previousState as any);
      expect(result).toEqual({
        success: true,
        data: "Previous state success: true",
        values: undefined,
        __ac_id: expect.any(String),
      });
    });

    it("should handle useActionState with only bind args", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            bindSchemas: [stringSchema, numberSchema] as const,
          })
          .handler(async ({ bindArgs, metadata }) => {
            const [text, number] = bindArgs;
            return {
              text: text as string,
              number: number as number,
              hadPreviousState: !!metadata.prevState,
            };
          }),
      );

      const initialState = initial(action);
      const result = await action("test", 42, initialState);

      expect(result).toEqual({
        success: true,
        data: {
          text: "test",
          number: 42,
          hadPreviousState: true,
        },
        values: undefined,
        __ac_id: expect.any(String),
      });
    });
  });

  describe("Previous state handling", () => {
    it("should pass previous state to action", async () => {
      let capturedPreviousState: unknown;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            capturedPreviousState = metadata.prevState;
            return "new result";
          }),
      );

      const previousState = {
        success: true,
        data: "previous data",
      } as const;

      await action(previousState as any);

      expect(capturedPreviousState).toEqual(previousState);
    });

    it("should work with error previous state", async () => {
      let capturedPreviousState: unknown;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            capturedPreviousState = metadata.prevState;
            return "recovery";
          }),
      );

      const errorState = {
        success: false,
        error: { type: "PREVIOUS_ERROR", message: "Previous failure" },
      } as const;

      await action(errorState as any);

      expect(capturedPreviousState).toEqual(errorState);
    });

    it("should handle complex previous state transitions", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .errors({
            transitionError: (from: string, to: string) =>
              ({
                type: "TRANSITION_ERROR",
                from,
                to,
                message: `Invalid transition from ${from} to ${to}`,
              }) as const,
          })
          .handler(async ({ input, metadata, errors }) => {
            const currentState = input as string;
            const previousData = metadata.prevState?.success
              ? metadata.prevState.data
              : "initial";

            // Simulate state machine logic
            const validTransitions: Record<string, string[]> = {
              initial: ["loading", "error"],
              loading: ["success", "error"],
              success: ["loading"],
              error: ["loading", "initial"],
            };

            const validNext = validTransitions[previousData as string] || [];
            if (!validNext.includes(currentState)) {
              return errors.transitionError(
                previousData as string,
                currentState,
              );
            }

            return currentState;
          }),
      );

      // Test valid transition
      const loadingState = { success: true, data: "initial" } as const;
      const validResult = await action(loadingState as any, "loading");
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toBe("loading");
      }

      // Test invalid transition
      const successState = { success: true, data: "success" } as const;
      const invalidResult = await action(successState as any, "error");
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("TRANSITION_ERROR");
      }
    });

    it("should handle undefined/null previous states", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            return {
              hasPreviousState: !!metadata.prevState,
              previousStateType: typeof metadata.prevState,
            };
          }),
      );

      // @ts-expect-error - Testing undefined
      const undefinedResult = await action(undefined);
      expect(undefinedResult.success).toBe(true);
      if (undefinedResult.success) {
        expect(undefinedResult.data.hasPreviousState).toBe(false);
        expect(undefinedResult.data.previousStateType).toBe("undefined");
      }

      // @ts-expect-error - Testing null
      const nullResult = await action(null);
      expect(nullResult.success).toBe(true);
      if (nullResult.success) {
        expect(nullResult.data.hasPreviousState).toBe(false);
        expect(nullResult.data.previousStateType).toBe("object");
      }
    });

    it("should handle malformed previous states gracefully", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            const state = metadata.prevState;
            return {
              isObject: typeof state === "object",
              hasSuccess: state && "success" in state,
              successValue: state && "success" in state ? state.success : null,
            };
          }),
      );

      const malformedState = { data: "some data" };
      // @ts-expect-error - Test with malformed state (missing success property)
      const result = await action(malformedState);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isObject).toBe(true);
        expect(result.data.hasSuccess).toBe(false);
        expect(result.data.successValue).toBe(null);
      }
    });
  });

  describe("Progressive enhancement", () => {
    it("should handle FormData input", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            // Should handle FormData as raw input
            expect(metadata.rawInput).toBeInstanceOf(FormData);
            return "form processed";
          }),
      );

      const formData = new FormData();
      formData.append("name", "John");
      formData.append("email", "john@example.com");

      const initialState = initial(action);
      const result = await action(initialState, formData);

      expect(result).toEqual({
        success: true,
        data: "form processed",
        values: {
          name: "John",
          email: "john@example.com",
        },
        __ac_id: expect.any(String),
      });
    });

    it("should validate FormData with schema", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (input instanceof FormData) {
                    const name = input.get("name");
                    if (typeof name === "string" && name.length > 0) {
                      return { value: { name } };
                    }
                  }
                  return {
                    issues: [{ message: "Invalid form data", path: [] }],
                  };
                },
              },
              "~validate": function (input: unknown) {
                return this["~standard"].validate(input);
              },
            } as const,
          })
          .handler(async ({ input }) => {
            return `Hello ${(input as { name: string }).name}!`;
          }),
      );

      const validFormData = new FormData();
      validFormData.append("name", "Alice");

      const invalidFormData = new FormData();
      // Missing name field

      const initialState = initial(action);

      // Test valid form data
      const validResult = await action(initialState, validFormData);
      expect(validResult).toEqual({
        success: true,
        data: "Hello Alice!",
        values: {
          name: "Alice",
        },
        __ac_id: expect.any(String),
      });

      // Test invalid form data
      const invalidResult = await action(initialState, invalidFormData);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle complex FormData structures", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: {
              "~standard": {
                version: 1,
                vendor: "test",
                validate: (input: unknown) => {
                  if (input instanceof FormData) {
                    const data: Record<string, unknown> = {};
                    const errors: Array<{
                      message: string;
                      path: (string | number)[];
                    }> = [];

                    // Extract and validate multiple fields
                    const name = input.get("name");
                    const age = input.get("age");
                    const tags = input.getAll("tags");

                    if (!name || typeof name !== "string") {
                      errors.push({
                        message: "Name is required",
                        path: ["name"],
                      });
                    } else {
                      data.name = name;
                    }

                    if (!age || isNaN(Number(age))) {
                      errors.push({
                        message: "Valid age is required",
                        path: ["age"],
                      });
                    } else {
                      data.age = Number(age);
                    }

                    data.tags = tags.filter((tag) => typeof tag === "string");

                    if (errors.length > 0) {
                      return { issues: errors };
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
            } as const,
          })
          .handler(async ({ input }) => {
            const data = input as { name: string; age: number; tags: string[] };
            return {
              message: `Hello ${data.name}, age ${data.age}`,
              tagCount: data.tags.length,
              tags: data.tags,
            };
          }),
      );

      const formData = new FormData();
      formData.append("name", "Bob");
      formData.append("age", "25");
      formData.append("tags", "developer");
      formData.append("tags", "typescript");
      formData.append("tags", "react");

      const initialState = initial(action);
      const result = await action(initialState, formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("Hello Bob, age 25");
        expect(result.data.tagCount).toBe(3);
        expect(result.data.tags).toEqual(["developer", "typescript", "react"]);
      }
    });

    it("should handle non-FormData input in useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input, metadata }) => {
            return {
              input: input as string,
              wasFormData: (metadata.rawInput as any) instanceof FormData,
              rawInputType: typeof metadata.rawInput,
            };
          }),
      );

      const initialState = initial(action);
      const result = await action(initialState, "regular string input");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.input).toBe("regular string input");
        expect(result.data.wasFormData).toBe(false);
        expect(result.data.rawInputType).toBe("string");
      }
    });

    it("should handle empty FormData", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata }) => {
            const formData = metadata.rawInput as FormData;
            const entries = Array.from(formData.entries());
            return {
              isFormData: metadata.rawInput instanceof FormData,
              entryCount: entries.length,
              isEmpty: entries.length === 0,
            };
          }),
      );

      const emptyFormData = new FormData();
      const initialState = initial(action);
      const result = await action(initialState, emptyFormData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFormData).toBe(true);
        expect(result.data.entryCount).toBe(0);
        expect(result.data.isEmpty).toBe(true);
      }
    });
  });

  describe("Error handling with useActionState", () => {
    it("should return error state for validation failures", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return input;
          }),
      );

      const initialState = initial(action);
      // @ts-expect-error - Testing invalid input
      const result = await action(initialState, 123); // Invalid input

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should return error state for custom errors", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .errors({
            businessLogicError: (message: string) =>
              ({
                type: "BUSINESS_LOGIC_ERROR",
                message,
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.businessLogicError("Invalid business operation");
          }),
      );

      const initialState = initial(action);
      const result = await action(initialState);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "BUSINESS_LOGIC_ERROR",
          message: "Invalid business operation",
        });
      }
    });

    it("should handle bind args validation errors in useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [multiplier] = bindArgs;
            return (input as string).repeat(multiplier as number);
          }),
      );

      const initialState = initial(action);
      // @ts-expect-error - Testing invalid bind args
      const result = await action("invalid", initialState, "test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle output validation errors in useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            outputSchema: numberSchema,
          })
          .handler(async ({ input }) => {
            // Return string when number is expected
            return input; // This will fail output validation
          }),
      );

      const initialState = initial(action);
      const result = await action(initialState, "not-a-number");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle thrown errors in useActionState", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            handleThrownError: (error: unknown) =>
              ({
                type: "USEACTIONSTATE_THROWN_ERROR",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              }) as const,
          })
          .handler(async () => {
            throw new Error("Action threw an error");
          }),
      );

      const initialState = initial(action);
      const result = await action(initialState);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("USEACTIONSTATE_THROWN_ERROR");
        expect(result.error.message).toBe("Action threw an error");
      }
    });

    it("should handle error state persistence across calls", async () => {
      let callCount = 0;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .errors({
            persistentError: (attempt: number) =>
              ({
                type: "PERSISTENT_ERROR",
                attempt,
                message: `Failed attempt ${attempt}`,
              }) as const,
          })
          .handler(async ({ metadata, errors }) => {
            callCount++;

            // Check if previous state was an error
            const wasError =
              metadata.prevState &&
              !metadata.prevState.success &&
              metadata.prevState.error.type === "PERSISTENT_ERROR";

            if (callCount <= 2) {
              return errors.persistentError(callCount);
            }

            return {
              finalAttempt: callCount,
              hadPreviousError: wasError,
              previousErrorType:
                wasError && metadata.prevState && !metadata.prevState.success
                  ? metadata.prevState.error.type
                  : null,
            };
          }),
      );

      const initialState = initial(action);

      // First call - should error
      const firstResult = await action(initialState);
      expect(firstResult.success).toBe(false);

      // Second call with error state - should error again
      const secondResult = await action(firstResult);
      expect(secondResult.success).toBe(false);

      // Third call with error state - should succeed
      const thirdResult = await action(secondResult);
      expect(thirdResult.success).toBe(true);
      if (thirdResult.success) {
        expect(thirdResult.data.finalAttempt).toBe(3);
        expect(thirdResult.data.hadPreviousError).toBe(true);
        expect(thirdResult.data.previousErrorType).toBe("PERSISTENT_ERROR");
      }
    });
  });

  describe("Callbacks with useActionState", () => {
    it("should execute callbacks with previous state in metadata", async () => {
      let callbackMetadata: unknown;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "success";
          })
          .callbacks({
            onSuccess: ({ metadata }) => {
              callbackMetadata = metadata;
            },
          }),
      );

      const previousState = {
        success: false,
        error: { type: "PREVIOUS_ERROR" },
      } as const;

      await action(previousState as any);

      expect(callbackMetadata).toEqual(
        expect.objectContaining({
          prevState: previousState,
        }),
      );
    });

    it("should execute callbacks with bind args in useActionState", async () => {
      let capturedCallbackData: unknown;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [multiplier] = bindArgs;
            return (input as string).repeat(multiplier as number);
          })
          .callbacks({
            onSuccess: ({ data, metadata }) => {
              capturedCallbackData = {
                result: data,
                hasPreviousState: !!metadata.prevState,
              };
            },
          }),
      );

      const initialState = initial(action);
      await action(2, initialState, "Hi");

      expect(capturedCallbackData).toEqual({
        result: "HiHi",
        hasPreviousState: true,
      });
    });

    it("should execute error callbacks with useActionState", async () => {
      let errorCallbackData: unknown;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .errors({
            testError: (message: string) =>
              ({
                type: "TEST_ERROR",
                message,
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.testError("Test error message");
          })
          .callbacks({
            onError: ({ error, metadata }) => {
              errorCallbackData = {
                errorType: error.type,
                errorMessage: "message" in error ? error.message : undefined,
                hasPreviousState: !!metadata.prevState,
              };
            },
          }),
      );

      const previousState = { success: true, data: "previous" } as const;
      await action(previousState as any, "trigger-error");

      expect(errorCallbackData).toEqual({
        errorType: "TEST_ERROR",
        errorMessage: "Test error message",
        hasPreviousState: true,
      });
    });

    it("should execute onSettled callbacks with useActionState", async () => {
      const settledCallbacks: unknown[] = [];

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "error") {
              throw new Error("Test error");
            }
            return input;
          })
          .callbacks({
            onSettled: ({ result, metadata }) => {
              settledCallbacks.push({
                success: result.success,
                hasPreviousState: !!metadata.prevState,
              });
            },
          }),
      );

      const initialState = initial(action);

      // Test success case
      await action(initialState, "success");
      expect(settledCallbacks).toHaveLength(1);
      expect(settledCallbacks[0]).toEqual({
        success: true,
        hasPreviousState: true,
      });

      // Test error case
      await action(initialState, "error");
      expect(settledCallbacks).toHaveLength(2);
      expect(settledCallbacks[1]).toEqual({
        success: false,
        hasPreviousState: true,
      });
    });
  });

  describe("Type enforcement", () => {
    it("should enforce api result format for useActionState", async () => {
      // This test verifies that the type system enforces api format
      // The action should only return ApiResult when useActionState is true
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            // resultFormat is forced to be "api"
          })
          .handler(async () => {
            return "test";
          }),
      );

      const initialState = initial(action);
      const result = await action(initialState);

      // Should be ApiResult format
      expect(typeof result).toBe("object");
      expect("success" in result).toBe(true);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test");
      }
    });

    it("should maintain type consistency across state transitions", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input, metadata }) => {
            const currentInput = input as string;
            const previousResult = metadata.prevState;

            return {
              currentInput,
              previousWasSuccess: previousResult?.success === true,
              previousData: previousResult?.success
                ? previousResult.data
                : null,
              previousError: !previousResult?.success
                ? previousResult?.error
                : null,
            };
          }),
      );

      const initialState = initial(action);

      // First call
      const firstResult = await action(initialState, "first");
      expect(firstResult.success).toBe(true);

      // Second call with previous successful state
      const secondResult = await action(firstResult, "second");
      expect(secondResult.success).toBe(true);
      if (secondResult.success) {
        expect(secondResult.data.currentInput).toBe("second");
        expect(secondResult.data.previousWasSuccess).toBe(true);
        expect(secondResult.data.previousData).toEqual({
          currentInput: "first",
          previousWasSuccess: false,
          previousData: null,
          previousError: {
            type: "INITIAL_STATE",
            message: "Action has not been executed yet",
          },
        });
        expect(secondResult.data.previousError).toBe(null);
      }
    });

    it("should handle type inference with complex bind args", async () => {
      const complexSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (
              typeof input === "object" &&
              input !== null &&
              "id" in input &&
              "name" in input
            ) {
              return { value: input };
            }
            return { issues: [{ message: "Invalid object", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema, complexSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [count, obj] = bindArgs;
            return {
              input: input as string,
              count: count as number,
              obj: obj as { id: unknown; name: unknown },
              combined: `${input as string}-${count}-${
                (obj as { name: unknown }).name
              }`,
            };
          }),
      );

      const initialState = initial(action);
      const complexObj = { id: "123", name: "test" };
      const result = await action(5, complexObj, initialState, "hello");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.input).toBe("hello");
        expect(result.data.count).toBe(5);
        expect(result.data.obj).toEqual(complexObj);
        expect(result.data.combined).toBe("hello-5-test");
      }
    });
  });
});
