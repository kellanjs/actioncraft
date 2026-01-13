import { actioncraft, initial } from "../../../src/index";
import { stringSchema, numberSchema } from "../../__fixtures__/schemas";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Callbacks", () => {
  const onStartMock = vi.fn();
  const onSuccessMock = vi.fn();
  const onErrorMock = vi.fn();
  const onSettledMock = vi.fn();

  beforeEach(() => {
    onStartMock.mockClear();
    onSuccessMock.mockClear();
    onErrorMock.mockClear();
    onSettledMock.mockClear();
  });

  describe("onStart", () => {
    it("should be called at the beginning of action execution", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .callbacks({
          onStart: onStartMock,
        })
        .build();

      await action("hello");

      expect(onStartMock).toHaveBeenCalledTimes(1);
      expect(onStartMock).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          rawInput: "hello",
          rawBindArgs: [],
          validatedInput: undefined, // Not yet validated
          validatedBindArgs: undefined, // Not yet validated
        }),
      });
    });

    it("should be called even when action fails", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onStart: onStartMock,
        })
        .build();

      // @ts-expect-error - Testing invalid input
      await action(123);

      expect(onStartMock).toHaveBeenCalledTimes(1);
      expect(onStartMock).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          rawInput: 123,
          rawBindArgs: [],
          validatedInput: undefined,
          validatedBindArgs: undefined,
        }),
      });
    });

    it("should handle async onStart callbacks", async () => {
      let asyncCallbackExecuted = false;
      const callbackOrder: string[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          callbackOrder.push("action");
          return input;
        })
        .callbacks({
          onStart: async ({ metadata }) => {
            callbackOrder.push("onStart");
            // Simulate async operation
            await new Promise((resolve) => setTimeout(resolve, 10));
            asyncCallbackExecuted = true;
          },
          onSuccess: async ({ data, metadata }) => {
            callbackOrder.push("onSuccess");
          },
        })
        .build();

      await action("async-test");

      expect(asyncCallbackExecuted).toBe(true);
      expect(callbackOrder).toEqual(["onStart", "action", "onSuccess"]);
    });

    it("should provide rawInput and prevState in metadata", async () => {
      let capturedMetadata: unknown;

      const action = actioncraft()
        .config({ useActionState: true })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .callbacks({
          onStart: ({ metadata }) => {
            capturedMetadata = metadata;
          },
        })
        .build();

      const prevState = initial(action);
      await action(2, prevState, "meta");

      expect(capturedMetadata).toEqual(
        expect.objectContaining({
          rawInput: "meta",
          rawBindArgs: [2],
          prevState: prevState,
          validatedInput: undefined,
          validatedBindArgs: undefined,
        }),
      );
    });

    it("should work with no input schema", async () => {
      let capturedMetadata: unknown;

      const action = actioncraft()
        .handler(async () => {
          return "no-input-schema";
        })
        .callbacks({
          onStart: ({ metadata }) => {
            capturedMetadata = metadata;
          },
        })
        .build();

      await action();

      expect(capturedMetadata).toEqual(
        expect.objectContaining({
          rawInput: undefined,
          rawBindArgs: [],
          prevState: undefined,
          validatedInput: undefined,
          validatedBindArgs: undefined,
        }),
      );
    });

    it("should provide rawBindArgs even when validation fails", async () => {
      let capturedErrorMetadata: unknown;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onError: ({ metadata }) => {
            capturedErrorMetadata = metadata;
          },
        })
        .build();

      // @ts-expect-error - Testing invalid input to trigger validation failure
      await action(42, 123); // bindArg is valid, input is invalid

      expect(capturedErrorMetadata).toEqual(
        expect.objectContaining({
          rawInput: 123,
          rawBindArgs: [42],
          validatedInput: undefined, // Input validation failed
          validatedBindArgs: undefined, // Not reached
        }),
      );
    });
  });

  describe("onSuccess", () => {
    it("should be called on successful action execution", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .callbacks({
          onSuccess: onSuccessMock,
        })
        .build();

      await action("hello");

      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(onSuccessMock).toHaveBeenCalledWith({
        data: "HELLO",
        metadata: expect.objectContaining({
          rawInput: "hello",
          validatedInput: "hello",
        }),
      });
    });

    it("should receive the correct data and metadata", async () => {
      let capturedCallbackData: unknown;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .callbacks({
          onSuccess: (data) => {
            capturedCallbackData = data;
          },
        })
        .build();

      await action(3, "Hi");

      expect(capturedCallbackData).toEqual({
        data: "HiHiHi",
        metadata: expect.objectContaining({
          rawInput: "Hi",
          validatedInput: "Hi",
        }),
      });
    });

    it("should not be called on failure", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSuccess: onSuccessMock,
        })
        .build();

      // @ts-expect-error - Testing invalid input
      await action(123);

      expect(onSuccessMock).not.toHaveBeenCalled();
    });

    it("should handle async onSuccess callbacks", async () => {
      let asyncCallbackExecuted = false;
      let asyncCallbackData: unknown;

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSuccess: async ({ data, metadata }) => {
            // Simulate async operation
            await new Promise((resolve) => setTimeout(resolve, 10));
            asyncCallbackExecuted = true;
            asyncCallbackData = { data, metadata };
          },
        })
        .build();

      await action("async-test");

      expect(asyncCallbackExecuted).toBe(true);
      expect(asyncCallbackData).toEqual({
        data: "async-test",
        metadata: expect.objectContaining({
          rawInput: "async-test",
          validatedInput: "async-test",
        }),
      });
    });

    it("should handle complex data structures in onSuccess", async () => {
      let capturedData: unknown;

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return {
            processedInput: input,
            timestamp: Date.now(),
            metadata: {
              version: "1.0",
              source: "test",
            },
            items: [1, 2, 3],
          };
        })
        .callbacks({
          onSuccess: ({ data }) => {
            capturedData = data;
          },
        })
        .build();

      await action("complex");

      expect(capturedData).toEqual(
        expect.objectContaining({
          processedInput: "complex",
          timestamp: expect.any(Number),
          metadata: {
            version: "1.0",
            source: "test",
          },
          items: [1, 2, 3],
        }),
      );
    });

    it("should provide complete metadata in onSuccess", async () => {
      let capturedMetadata: unknown;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
          outputSchema: stringSchema,
        })
        .handler(async ({ input, bindArgs }) => {
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .callbacks({
          onSuccess: ({ metadata }) => {
            capturedMetadata = metadata;
          },
        })
        .build();

      await action(2, "meta");

      expect(capturedMetadata).toEqual(
        expect.objectContaining({
          validatedInput: "meta",
          validatedBindArgs: [2],
        }),
      );
    });

    it("should handle onSuccess with no input schema", async () => {
      let callbackCalled = false;

      const action = actioncraft()
        .handler(async () => {
          return "no-input-schema";
        })
        .callbacks({
          onSuccess: ({ data, metadata }) => {
            callbackCalled = true;
            expect(data).toBe("no-input-schema");
            expect(metadata.rawInput).toBeUndefined();
          },
        })
        .build();

      await action();
      expect(callbackCalled).toBe(true);
    });
  });

  describe("onError", () => {
    it("should be called on a failed action execution (custom error)", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          businessError: (message: string) =>
            ({
              type: "BUSINESS_ERROR",
              message,
            }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "fail") {
            return errors.businessError("Business logic failed");
          }
          return input;
        })
        .callbacks({
          onError: onErrorMock,
        })
        .build();

      await action("fail");

      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledWith({
        error: {
          type: "BUSINESS_ERROR",
          message: "Business logic failed",
        },
        metadata: expect.objectContaining({
          rawInput: "fail",
          validatedInput: "fail",
        }),
      });
    });

    it("should be called on input validation failure", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onError: onErrorMock,
        })
        .build();

      // @ts-expect-error - Testing invalid input
      await action(123);

      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: "INPUT_VALIDATION",
        }),
        metadata: expect.objectContaining({
          rawInput: 123,
        }),
      });
    });

    it("should receive the correct error and metadata", async () => {
      let capturedErrorData: unknown;

      const action = actioncraft()
        .errors({
          customError: (code: number) =>
            ({
              type: "CUSTOM_ERROR",
              code,
              timestamp: Date.now(),
            }) as const,
        })
        .handler(async ({ errors }) => {
          return errors.customError(404);
        })
        .callbacks({
          onError: (data) => {
            capturedErrorData = data;
          },
        })
        .build();

      await action();

      expect(capturedErrorData).toEqual({
        error: expect.objectContaining({
          type: "CUSTOM_ERROR",
          code: 404,
        }),
        metadata: expect.objectContaining({
          rawInput: undefined,
        }),
      });
    });

    it("should not be called on success", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onError: onErrorMock,
        })
        .build();

      await action("success");

      expect(onErrorMock).not.toHaveBeenCalled();
    });

    it("should handle bind args validation errors", async () => {
      let capturedError: unknown;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .callbacks({
          onError: ({ error, metadata }) => {
            capturedError = { error, metadata };
          },
        })
        .build();

      // @ts-expect-error - Testing invalid bind args
      await action("invalid", "test");

      expect(capturedError).toEqual({
        error: expect.objectContaining({
          type: "BIND_ARGS_VALIDATION",
        }),
        metadata: expect.objectContaining({
          rawInput: "test",
        }),
      });
    });

    it("should handle output validation errors", async () => {
      let capturedError: unknown;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: numberSchema,
        })
        .handler(async ({ input }) => {
          // Return string when number is expected
          return input;
        })
        .callbacks({
          onError: ({ error, metadata }) => {
            capturedError = { error, metadata };
          },
        })
        .build();

      await action("not-a-number");

      expect(capturedError).toEqual({
        error: expect.objectContaining({
          type: "OUTPUT_VALIDATION",
        }),
        metadata: expect.objectContaining({
          rawInput: "not-a-number",
          validatedInput: "not-a-number",
        }),
      });
    });

    it("should handle thrown errors", async () => {
      let capturedError: unknown;

      const action = actioncraft()
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "THROWN_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            }) as const,
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          if (input === "throw") {
            throw new Error("Test thrown error");
          }
          return input;
        })
        .callbacks({
          onError: ({ error, metadata }) => {
            capturedError = { error, metadata };
          },
        })
        .build();

      await action("throw");

      expect(capturedError).toEqual({
        error: expect.objectContaining({
          type: "THROWN_ERROR",
          message: "Test thrown error",
        }),
        metadata: expect.objectContaining({
          rawInput: "throw",
          validatedInput: "throw",
        }),
      });
    });

    it("should handle async onError callbacks", async () => {
      let asyncErrorProcessed = false;

      const action = actioncraft()
        .errors({
          asyncError: () => ({ type: "ASYNC_ERROR" }) as const,
        })
        .handler(async ({ errors }) => {
          return errors.asyncError();
        })
        .callbacks({
          onError: async ({ error }) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            asyncErrorProcessed = true;
            expect(error.type).toBe("ASYNC_ERROR");
          },
        })
        .build();

      await action();
      expect(asyncErrorProcessed).toBe(true);
    });

    it("should handle complex error structures", async () => {
      let capturedComplexError: unknown;

      const action = actioncraft()
        .errors({
          complexError: (details: Record<string, unknown>) =>
            ({
              type: "COMPLEX_ERROR",
              details,
              severity: "high",
              suggestions: ["Try again", "Check input"],
              context: {
                timestamp: Date.now(),
                source: "test",
              },
            }) as const,
        })
        .handler(async ({ errors }) => {
          return errors.complexError({
            field: "username",
            value: "invalid",
            reason: "too_short",
          });
        })
        .callbacks({
          onError: ({ error }) => {
            capturedComplexError = error;
          },
        })
        .build();

      await action();

      expect(capturedComplexError).toEqual(
        expect.objectContaining({
          type: "COMPLEX_ERROR",
          details: {
            field: "username",
            value: "invalid",
            reason: "too_short",
          },
          severity: "high",
          suggestions: ["Try again", "Check input"],
          context: expect.objectContaining({
            timestamp: expect.any(Number),
            source: "test",
          }),
        }),
      );
    });
  });

  describe("onSettled", () => {
    it("should be called on both success and failure", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          testError: () => ({ type: "TEST_ERROR" }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "fail") {
            return errors.testError();
          }
          return input;
        })
        .callbacks({
          onSettled: onSettledMock,
        })
        .build();

      // Test success case
      await action("success");
      expect(onSettledMock).toHaveBeenCalledWith({
        result: { success: true, data: "success", __ac_id: expect.any(String) },
        metadata: expect.objectContaining({
          rawInput: "success",
          validatedInput: "success",
        }),
      });

      onSettledMock.mockClear();

      // Test failure case
      await action("fail");
      expect(onSettledMock).toHaveBeenCalledWith({
        result: {
          success: false,
          error: { type: "TEST_ERROR" },
          __ac_id: expect.any(String),
        },
        metadata: expect.objectContaining({
          rawInput: "fail",
          validatedInput: "fail",
        }),
      });
    });

    it("should receive the final result and metadata", async () => {
      let capturedSettledData: unknown;

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return `Processed: ${input as string}`;
        })
        .callbacks({
          onSettled: (data) => {
            capturedSettledData = data;
          },
        })
        .build();

      await action("test");

      expect(capturedSettledData).toEqual({
        result: {
          success: true,
          data: "Processed: test",
          __ac_id: expect.any(String),
        },
        metadata: expect.objectContaining({
          rawInput: "test",
          validatedInput: "test",
        }),
      });
    });

    it("should handle async onSettled callbacks", async () => {
      let asyncSettledExecuted = false;
      const settledResults: unknown[] = [];

      const action = actioncraft()
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
          onSettled: async ({ result }) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            asyncSettledExecuted = true;
            settledResults.push(result);
          },
        })
        .build();

      await action("success");
      await action("error");

      expect(asyncSettledExecuted).toBe(true);
      expect(settledResults).toEqual([
        { success: true, data: "success", __ac_id: expect.any(String) },
        {
          success: false,
          error: { type: "TEST_ERROR" },
          __ac_id: expect.any(String),
        },
      ]);
    });

    it("should handle onSettled with different result formats", async () => {
      const settledResults: unknown[] = [];

      const apiAction = actioncraft()
        .config({
          resultFormat: "api",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSettled: ({ result }) => {
            settledResults.push({ format: "api", result });
          },
        })
        .build();

      const functionalAction = actioncraft()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSettled: ({ result }) => {
            settledResults.push({ format: "functional", result });
          },
        })
        .build();

      await apiAction("api-test");
      await functionalAction("functional-test");

      expect(settledResults).toEqual([
        {
          format: "api",
          result: {
            success: true,
            data: "api-test",
            __ac_id: expect.any(String),
          },
        },
        {
          format: "functional",
          result: {
            type: "ok",
            value: "functional-test",
            __ac_id: expect.any(String),
          },
        },
      ]);
    });

    it("should provide consistent metadata across all error types", async () => {
      const metadataCaptures: unknown[] = [];

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
          outputSchema: stringSchema,
        })
        .errors({
          customError: () => ({ type: "CUSTOM_ERROR" }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "custom-error") {
            return errors.customError();
          }
          if (input === "output-error") {
            return input; // This will be transformed to wrong type by output validation
          }
          return input;
        })
        .callbacks({
          onSettled: ({ metadata }) => {
            metadataCaptures.push(metadata);
          },
        })
        .build();

      // Success case
      await action(2, "success");

      // Custom error case
      await action(2, "custom-error");

      // Output validation error case
      await action(2, "output-error");

      // Input validation error case
      // @ts-expect-error - Testing invalid input
      await action(2, 123);

      expect(metadataCaptures).toHaveLength(4);
      metadataCaptures.forEach((metadata, index) => {
        expect(metadata).toEqual(
          expect.objectContaining({
            rawInput: index === 3 ? 123 : expect.any(String),
          }),
        );
      });
    });

    it("should provide StatefulApiResult when useActionState is enabled", async () => {
      const settledResults: unknown[] = [];

      const action = actioncraft()
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .callbacks({
          onSettled: ({ result }) => {
            settledResults.push(result);
          },
        })
        .build();

      const prevState = { success: true as const, data: "prev" };

      // Success case
      await action(prevState as any, "abc");

      // Failure case (input validation error)
      // @ts-expect-error - Testing invalid input
      await action(prevState as any, 123);

      // Expectations for success result
      expect(settledResults[0]).toEqual({
        success: true,
        data: "ABC",
        values: undefined,
        __ac_id: expect.any(String),
      });

      // Expectations for error result (shape-focused)
      expect(settledResults[1]).toEqual(
        expect.objectContaining({
          success: false,
          values: undefined,
        }),
      );
    });
  });

  describe("Callback Execution Order", () => {
    it("should execute callbacks after the main action logic", async () => {
      const executionOrder: string[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          executionOrder.push("action");
          return input;
        })
        .callbacks({
          onSuccess: () => {
            executionOrder.push("onSuccess");
          },
          onSettled: () => {
            executionOrder.push("onSettled");
          },
        })
        .build();

      await action("test");

      expect(executionOrder).toEqual(["action", "onSuccess", "onSettled"]);
    });

    it("should execute onError before onSettled on failure", async () => {
      const executionOrder: string[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          testError: () => ({ type: "TEST_ERROR" }) as const,
        })
        .handler(async ({ errors }) => {
          executionOrder.push("action");
          return errors.testError();
        })
        .callbacks({
          onError: () => {
            executionOrder.push("onError");
          },
          onSettled: () => {
            executionOrder.push("onSettled");
          },
        })
        .build();

      await action("test");

      expect(executionOrder).toEqual(["action", "onError", "onSettled"]);
    });

    it("should handle multiple callbacks of the same type", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // Note: This tests the behavior if multiple callbacks are somehow registered
      // The current API doesn't directly support this, but we test robustness
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSuccess: () => {
            callback1();
            callback2();
          },
        })
        .build();

      await action("test");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should execute callbacks in the correct order with async operations", async () => {
      const executionOrder: string[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          executionOrder.push("action-start");
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push("action-end");
          return input;
        })
        .callbacks({
          onSuccess: async () => {
            executionOrder.push("onSuccess-start");
            await new Promise((resolve) => setTimeout(resolve, 5));
            executionOrder.push("onSuccess-end");
          },
          onSettled: async () => {
            executionOrder.push("onSettled-start");
            await new Promise((resolve) => setTimeout(resolve, 5));
            executionOrder.push("onSettled-end");
          },
        })
        .build();

      await action("async-test");

      expect(executionOrder).toEqual([
        "action-start",
        "action-end",
        "onSuccess-start",
        "onSuccess-end",
        "onSettled-start",
        "onSettled-end",
      ]);
    });

    it("should maintain execution order even with callback errors", async () => {
      const executionOrder: string[] = [];
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          executionOrder.push("action");
          return input;
        })
        .callbacks({
          onSuccess: () => {
            executionOrder.push("onSuccess");
            throw new Error("Callback error");
          },
          onSettled: () => {
            executionOrder.push("onSettled");
          },
        })
        .build();

      await action("test");

      expect(executionOrder).toEqual(["action", "onSuccess", "onSettled"]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("Callback Error Handling", () => {
    it("should not affect action result when onStart callback throws", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onStart: () => {
            throw new Error("Start callback error");
          },
        })
        .build();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "test",
        __ac_id: expect.any(String),
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error in onStart callback"),
        expect.any(Error),
      );
    });

    it("should not affect action result when onSuccess callback throws", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSuccess: () => {
            throw new Error("Success callback error");
          },
        })
        .build();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "test",
        __ac_id: expect.any(String),
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error in onSuccess callback"),
        expect.any(Error),
      );
    });

    it("should not affect action result when onError callback throws", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .errors({
          testError: () => ({ type: "TEST_ERROR" }) as const,
        })
        .handler(async ({ errors }) => {
          return errors.testError();
        })
        .callbacks({
          onError: () => {
            throw new Error("Error callback error");
          },
        })
        .build();

      const result = await action("test");

      expect(result).toEqual({
        success: false,
        error: { type: "TEST_ERROR" },
        __ac_id: expect.any(String),
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error in onError callback"),
        expect.any(Error),
      );
    });

    it("should not affect action result when onSettled callback throws", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSettled: () => {
            throw new Error("Settled callback error");
          },
        })
        .build();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "test",
        __ac_id: expect.any(String),
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error in onSettled callback"),
        expect.any(Error),
      );
    });

    it("should handle async callback errors gracefully", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSuccess: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            throw new Error("Async callback error");
          },
        })
        .build();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "test",
        __ac_id: expect.any(String),
      });

      // Wait a bit for the async callback to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should isolate callback errors from each other", async () => {
      const mockLogger = { error: vi.fn(), warn: vi.fn() };
      let onSettledCalled = false;

      const action = actioncraft()
        .config({ logger: mockLogger })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSuccess: () => {
            throw new Error("Success callback error");
          },
          onSettled: () => {
            onSettledCalled = true;
          },
        })
        .build();

      await action("test");

      expect(onSettledCalled).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("Advanced Callback Scenarios", () => {
    it("should handle callbacks with useActionState", async () => {
      const callbackData: unknown[] = [];

      const action = actioncraft()
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input, metadata }) => {
          return {
            input: input as string,
            hadPreviousState: !!metadata.prevState,
          };
        })
        .callbacks({
          onSuccess: ({ data, metadata }) => {
            callbackData.push({
              type: "success",
              data,
              hasPreviousState: !!metadata.prevState,
            });
          },
        })
        .build();

      const initialState = {
        success: false,
        error: { type: "UNHANDLED", message: "Initial" },
      } as const;
      await action(initialState as any, "test");

      expect(callbackData).toEqual([
        {
          type: "success",
          data: { input: "test", hadPreviousState: true },
          hasPreviousState: true,
        },
      ]);
    });

    it("should handle callbacks with complex bind args", async () => {
      let callbackMetadata: unknown;

      const complexSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "object" && input !== null && "id" in input) {
              return { value: input };
            }
            return { issues: [{ message: "Invalid object", path: [] }] };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, complexSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [count, obj] = bindArgs;
          return {
            input: input as string,
            count: count as number,
            obj: obj as { id: unknown },
          };
        })
        .callbacks({
          onSuccess: ({ metadata }) => {
            callbackMetadata = metadata;
          },
        })
        .build();

      await action(5, { id: "test-id" }, "complex");

      expect(callbackMetadata).toEqual(
        expect.objectContaining({
          rawInput: "complex",
          validatedInput: "complex",
        }),
      );
    });

    it("should handle callbacks with middleware-like patterns", async () => {
      const callbackChain: string[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          callbackChain.push("action");
          return input;
        })
        .callbacks({
          onSuccess: ({ data }) => {
            callbackChain.push("middleware-1");
            // Simulate middleware processing
            expect(data).toBe("test");
          },
          onSettled: ({ result }) => {
            callbackChain.push("middleware-2");
            // Simulate final processing
            expect(result.success).toBe(true);
          },
        })
        .build();

      await action("test");

      expect(callbackChain).toEqual(["action", "middleware-1", "middleware-2"]);
    });

    it("should handle callbacks with state accumulation patterns", async () => {
      const stateAccumulator: unknown[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return {
            timestamp: Date.now(),
            input: input as string,
          };
        })
        .callbacks({
          onSuccess: ({ data }) => {
            stateAccumulator.push({
              type: "success",
              timestamp: data.timestamp,
              input: data.input,
            });
          },
          onSettled: ({ result }) => {
            stateAccumulator.push({
              type: "settled",
              success: result.success,
              finalCount: stateAccumulator.length + 1,
            });
          },
        })
        .build();

      await action("accumulate-1");
      await action("accumulate-2");

      expect(stateAccumulator).toHaveLength(4);
      expect(stateAccumulator[0]).toEqual(
        expect.objectContaining({
          type: "success",
          input: "accumulate-1",
        }),
      );
      expect(stateAccumulator[3]).toEqual(
        expect.objectContaining({
          type: "settled",
          success: true,
          finalCount: 4,
        }),
      );
    });

    it("should handle callbacks with conditional execution", async () => {
      const conditionalCallbacks: unknown[] = [];

      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          conditionalError: (condition: string) =>
            ({
              type: "CONDITIONAL_ERROR",
              condition,
            }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "error") {
            return errors.conditionalError("triggered");
          }
          return input;
        })
        .callbacks({
          onSuccess: ({ data }) => {
            if ((data as string).includes("special")) {
              conditionalCallbacks.push({ type: "special-success", data });
            } else {
              conditionalCallbacks.push({ type: "normal-success", data });
            }
          },
          onError: ({ error }) => {
            if ("condition" in error && error.condition === "triggered") {
              conditionalCallbacks.push({ type: "conditional-error", error });
            } else {
              conditionalCallbacks.push({ type: "other-error", error });
            }
          },
        })
        .build();

      await action("normal");
      await action("special-case");
      await action("error");

      expect(conditionalCallbacks).toEqual([
        { type: "normal-success", data: "normal" },
        { type: "special-success", data: "special-case" },
        {
          type: "conditional-error",
          error: {
            type: "CONDITIONAL_ERROR",
            condition: "triggered",
          },
        },
      ]);
    });
  });
});
