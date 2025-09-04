import { action } from "../../../src/index";
import { isOk } from "../../../src/types/result";
import {
  stringSchema,
  numberSchema,
  nestedErrorSchema,
  simpleUserSchema,
} from "../../__fixtures__/schemas";
import { describe, expect, it, vi } from "../../setup";

describe("ActionBuilder Workflows", () => {
  describe("Happy path scenarios", () => {
    it("should execute a simple action successfully", async () => {
      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await craftedAction("hello world");

      expect(result).toEqual({
        success: true,
        data: "HELLO WORLD",
        __ac_id: expect.any(String),
      });
    });

    it("should handle actions without input schema", async () => {
      const craftedAction = action()
        .handler(async () => {
          return { message: "success", timestamp: Date.now() };
        })
        .craft();

      const result = await craftedAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("success");
        expect(typeof result.data.timestamp).toBe("number");
      }
    });

    it("should handle output validation", async () => {
      const craftedAction = action()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await craftedAction("test");

      expect(result).toEqual({
        success: true,
        data: "TEST",
        __ac_id: expect.any(String),
      });
    });
  });

  describe("Validation error scenarios", () => {
    it("should return validation error for invalid input", async () => {
      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await craftedAction(123); // Should fail string validation

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("formErrors" in result.error || "issues" in result.error).toBe(
          true,
        );
      }
    });

    it("should format validation errors as flattened by default", async () => {
      const craftedAction = action()
        .schemas({ inputSchema: nestedErrorSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await craftedAction({ invalid: "data" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should format validation errors as flattened when configured", async () => {
      const craftedAction = action()
        .config({
          validationErrorFormat: "flattened",
        })
        .schemas({ inputSchema: nestedErrorSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await craftedAction({ invalid: "data" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("issues" in result.error).toBe(true);
      }
    });
  });

  describe("Custom error scenarios", () => {
    it("should handle custom errors from handler", async () => {
      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .errors({
          notFound: (id: string) =>
            ({
              type: "NOT_FOUND",
              id,
            }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "missing") {
            return errors.notFound(input as string);
          }
          return input;
        })
        .craft();

      const result = await craftedAction("missing");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "NOT_FOUND",
          id: "missing",
        });
      }
    });

    it("should handle thrown errors with custom handler", async () => {
      const craftedAction = action()
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "CUSTOM_THROWN_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            }) as const,
        })
        .handler(async () => {
          throw new Error("Something went wrong!");
        })
        .craft();

      const result = await craftedAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "CUSTOM_THROWN_ERROR",
          message: "Something went wrong!",
        });
      }
    });

    it("should handle thrown errors with default handler", async () => {
      const craftedAction = action()
        .handler(async () => {
          throw new Error("Something went wrong!");
        })
        .craft();

      const result = await craftedAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "UNHANDLED",
          message: "An unhandled error occurred",
        });
      }
    });
  });

  describe("Result format configurations", () => {
    it("should return functional Result when configured", async () => {
      const craftedAction = action()
        .config({
          resultFormat: "functional",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await craftedAction("test");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe("TEST");
      }
    });

    it("should return api Result by default", async () => {
      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await craftedAction("test");

      expect(result).toEqual({
        success: true,
        data: "TEST",
        __ac_id: expect.any(String),
      });
    });
  });

  describe("Callback execution", () => {
    it("should execute onSuccess callback", async () => {
      const onSuccessMock = vi.fn();

      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .callbacks({
          onSuccess: onSuccessMock,
        })
        .craft();

      await craftedAction("test");

      expect(onSuccessMock).toHaveBeenCalledWith({
        data: "TEST",
        metadata: expect.objectContaining({
          rawInput: "test",
          validatedInput: "test",
        }),
      });
    });

    it("should execute onError callback", async () => {
      const onErrorMock = vi.fn();

      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onError: onErrorMock,
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      await craftedAction(123); // Invalid input

      expect(onErrorMock).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: "INPUT_VALIDATION",
        }),
        metadata: expect.objectContaining({
          rawInput: 123,
        }),
      });
    });

    it("should execute onSettled callback for both success and error", async () => {
      const onSettledMock = vi.fn();

      const craftedAction = action()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSettled: onSettledMock,
        })
        .craft();

      // Test success case
      await craftedAction("valid");
      expect(onSettledMock).toHaveBeenCalledWith({
        result: { success: true, data: "valid", __ac_id: expect.any(String) },
        metadata: expect.objectContaining({
          rawInput: "valid",
          validatedInput: "valid",
        }),
      });

      onSettledMock.mockClear();

      // Test error case
      // @ts-expect-error - Testing invalid input
      await craftedAction(123);
      expect(onSettledMock).toHaveBeenCalledWith({
        result: expect.objectContaining({ success: false }),
        metadata: expect.objectContaining({
          rawInput: 123,
        }),
      });
    });
  });

  describe("Bind arguments", () => {
    it("should handle bind arguments with validation", async () => {
      const craftedAction = action()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, simpleUserSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [multiplier, user] = bindArgs;
          const result = (input as string).repeat(multiplier as number);
          return `${(user as { name: string }).name}: ${result}`;
        })
        .craft();

      const result = await craftedAction(42, { name: "John", age: 30 }, "Hi");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain("John:");
        expect(result.data).toContain("Hi");
      }
    });

    it("should handle bind arguments without input schema", async () => {
      let capturedMetadata: unknown;

      const craftedAction = action()
        .schemas({
          bindSchemas: [numberSchema, simpleUserSchema] as const,
          // No inputSchema
        })
        .handler(async ({ bindArgs, metadata }) => {
          capturedMetadata = metadata;
          const [multiplier, user] = bindArgs;
          return `${(user as { name: string }).name} x${multiplier as number}`;
        })
        .craft();

      const result = await craftedAction(3, { name: "Alice", age: 25 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Alice x3");
      }

      // Action metadata contains rawInput, rawBindArgs, and prevState
      expect(capturedMetadata).toEqual({
        rawInput: undefined,
        rawBindArgs: [3, { name: "Alice", age: 25 }],
        prevState: undefined,
        actionId: expect.any(String),
      });
    });

    it("should handle bind arguments without input schema but extra parameter", async () => {
      // Test edge case: what if someone passes extra parameters?
      let capturedMetadata: unknown;

      const craftedAction = action()
        .schemas({
          bindSchemas: [numberSchema] as const,
          // No inputSchema
        })
        .handler(async ({ bindArgs, metadata }) => {
          capturedMetadata = metadata;
          const [multiplier] = bindArgs;
          return `Result x${multiplier as number}`;
        })
        .craft();

      // Call with extra parameter that shouldn't be treated as input
      const result = await craftedAction(5, "extraParameter");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Result x5");
      }

      // The extra parameter should be captured as rawInput for metadata
      expect(capturedMetadata).toEqual({
        rawInput: "extraParameter",
        rawBindArgs: [5],
        prevState: undefined,
        actionId: expect.any(String),
      });
    });
  });

  describe("useActionState workflows", () => {
    it("should handle useActionState signature without bind args", async () => {
      const craftedAction = action()
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input, metadata }) => {
          expect(metadata.prevState).toBeDefined();
          return (input as string).toUpperCase();
        })
        .craft();

      const previousState = {
        success: true as const,
        data: "previous",
        __ac_id: "test-id",
      };
      const result = await craftedAction(previousState, "hello");

      expect(result).toEqual({
        success: true,
        data: "HELLO",
        values: "hello",
        __ac_id: expect.any(String),
      });
    });

    it("should handle useActionState signature with bind args", async () => {
      const craftedAction = action()
        .config({
          useActionState: true,
        })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ input, bindArgs, metadata }) => {
          expect(metadata.prevState).toBeDefined();
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .craft();

      const previousState = {
        success: false as const,
        error: { type: "UNHANDLED" as const, message: "Previous error" },
        __ac_id: "test-id",
      };
      const result = await craftedAction(3, previousState as any, "Hi");

      expect(result).toEqual({
        success: true,
        data: "HiHiHi",
        values: "Hi",
        __ac_id: expect.any(String),
      });
    });

    it("should handle useActionState with complex bind args", async () => {
      const craftedAction = action()
        .config({
          useActionState: true,
        })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, simpleUserSchema] as const,
        })
        .handler(async ({ input, bindArgs, metadata }) => {
          expect(metadata.prevState).toBeDefined();
          const [multiplier, user] = bindArgs;
          const repeated = (input as string).repeat(multiplier as number);
          return `${(user as { name: string }).name}: ${repeated}`;
        })
        .craft();

      const previousState = {
        success: true as const,
        data: "previous result",
        __ac_id: "test-id",
      };
      const result = await craftedAction(
        2,
        { name: "Bob", age: 25 },
        previousState as any,
        "test",
      );

      expect(result).toEqual({
        success: true,
        data: "Bob: testtest",
        values: "test",
        __ac_id: expect.any(String),
      });
    });

    it("should ignore resultFormat when useActionState is true", async () => {
      const craftedAction = action()
        .config({
          useActionState: true,
          resultFormat: "functional",
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const previousState = {
        success: true as const,
        data: "prev",
        __ac_id: "test-id",
      };
      const result = await craftedAction(previousState, "hello");

      // Should return StatefulApiResult, not functional Result
      expect(result).toEqual({
        success: true,
        data: "HELLO",
        values: "hello",
        __ac_id: expect.any(String),
      });
    });
  });

  describe("Complex chaining scenarios", () => {
    it("should handle complete workflow with all features", async () => {
      const onStartMock = vi.fn();
      const onSuccessMock = vi.fn();
      const onErrorMock = vi.fn();
      const onSettledMock = vi.fn();

      const craftedAction = action()
        .config({
          validationErrorFormat: "nested",
          resultFormat: "api",
          handleThrownError: (error: unknown) =>
            ({
              type: "CUSTOM_ERROR",
              message: error instanceof Error ? error.message : "Unknown",
            }) as const,
        })
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .errors({
          businessError: (msg: string) =>
            ({ type: "BUSINESS_ERROR", msg }) as const,
          validationError: (field: string) =>
            ({ type: "VALIDATION_ERROR", field }) as const,
        })
        .handler(async ({ input, bindArgs, errors }) => {
          const [multiplier] = bindArgs;
          const str = input as string;

          if (str === "error") {
            return errors.businessError("Business logic failed");
          }

          if (multiplier === 0) {
            return errors.validationError("multiplier");
          }

          return str.repeat(multiplier as number);
        })
        .callbacks({
          onStart: onStartMock,
          onSuccess: onSuccessMock,
          onError: onErrorMock,
          onSettled: onSettledMock,
        })
        .craft();

      // Test successful execution
      const successResult = await craftedAction(2, "Hi");
      expect(successResult).toEqual({
        success: true,
        data: "HiHi",
        __ac_id: expect.any(String),
      });

      expect(onStartMock).toHaveBeenCalled();
      expect(onSuccessMock).toHaveBeenCalledWith({
        data: "HiHi",
        metadata: expect.objectContaining({
          rawInput: "Hi",
          validatedInput: "Hi",
          rawBindArgs: [2],
          validatedBindArgs: [2],
        }),
      });
      expect(onSettledMock).toHaveBeenCalledWith({
        result: expect.objectContaining({ success: true }),
        metadata: expect.any(Object),
      });

      // Reset mocks
      onStartMock.mockClear();
      onSuccessMock.mockClear();
      onErrorMock.mockClear();
      onSettledMock.mockClear();

      // Test business error
      const errorResult = await craftedAction(1, "error");
      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error.type).toBe("BUSINESS_ERROR");
      }

      expect(onStartMock).toHaveBeenCalled();
      expect(onErrorMock).toHaveBeenCalledWith({
        error: expect.objectContaining({ type: "BUSINESS_ERROR" }),
        metadata: expect.any(Object),
      });
      expect(onSettledMock).toHaveBeenCalledWith({
        result: expect.objectContaining({ success: false }),
        metadata: expect.any(Object),
      });
    });

    it("should handle method chaining with overrides", async () => {
      const craftedAction = action()
        .config({ resultFormat: "functional" })
        .config({ resultFormat: "api" }) // Override
        .schemas({ inputSchema: numberSchema })
        .schemas({ inputSchema: stringSchema }) // Override
        .errors({ first: () => ({ type: "FIRST" }) as const })
        .errors({ second: () => ({ type: "SECOND" }) as const }) // Override
        .handler(async ({ input, errors }) => {
          if (input === "error") {
            return errors.second();
          }
          return (input as string).toUpperCase();
        })
        .callbacks({ onSuccess: () => {} })
        .callbacks({ onError: () => {} }) // Override
        .craft();

      // Should use string schema (last override)
      const result = await craftedAction("hello");
      expect(result).toEqual({
        success: true,
        data: "HELLO",
        __ac_id: expect.any(String),
      });

      // Should use second error (last override)
      const errorResult = await craftedAction("error");
      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error.type).toBe("SECOND");
      }
    });
  });

  describe("Comparison with craft() API", () => {
    it("should produce identical results to craft() API", async () => {
      // ActionBuilder version
      const actionBuilderResult = action()
        .schemas({ inputSchema: stringSchema })
        .errors({
          customError: (msg: string) => ({ type: "CUSTOM", msg }) as const,
        })
        .handler(async ({ input, errors }) => {
          if (input === "error") {
            return errors.customError("Test error");
          }
          return (input as string).toUpperCase();
        })
        .craft();

      // craft() version (from existing tests)
      const { craft } = await import("../../../src/index");
      const craftResult = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            customError: (msg: string) => ({ type: "CUSTOM", msg }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input === "error") {
              return errors.customError("Test error");
            }
            return (input as string).toUpperCase();
          }),
      );

      // Test success case
      const actionBuilderSuccess = await actionBuilderResult("hello");
      const craftSuccess = await craftResult("hello");

      expect(actionBuilderSuccess.success).toBe(craftSuccess.success);
      if (actionBuilderSuccess.success && craftSuccess.success) {
        expect(actionBuilderSuccess.data).toBe(craftSuccess.data);
      }

      // Test error case
      const actionBuilderError = await actionBuilderResult("error");
      const craftError = await craftResult("error");

      expect(actionBuilderError.success).toBe(craftError.success);
      if (!actionBuilderError.success && !craftError.success) {
        expect(actionBuilderError.error.type).toBe(craftError.error.type);
      }
    });

    it("should handle useActionState identically to craft() API", async () => {
      // ActionBuilder version
      const actionBuilderResult = action()
        .config({ useActionState: true })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => (input as string).toUpperCase())
        .craft();

      // craft() version
      const { craft } = await import("../../../src/index");
      const craftResult = craft((action) =>
        action
          .config({ useActionState: true })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => (input as string).toUpperCase()),
      );

      const prevState = {
        success: true as const,
        data: "prev",
        __ac_id: "test-id",
      };

      const actionBuilderOutput = await actionBuilderResult(prevState, "hello");
      const craftOutput = await craftResult(prevState, "hello");

      // Compare structure without action IDs (they're randomly generated)
      expect(actionBuilderOutput.success).toBe(craftOutput.success);
      if (actionBuilderOutput.success && craftOutput.success) {
        expect(actionBuilderOutput.data).toBe(craftOutput.data);
        expect(actionBuilderOutput.values).toBe(craftOutput.values);
        expect(typeof actionBuilderOutput.__ac_id).toBe("string");
        expect(typeof craftOutput.__ac_id).toBe("string");
      }
    });
  });
});
