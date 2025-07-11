import { create } from "../../src/actioncraft";
import { isOk } from "../../src/types/result";
import {
  stringSchema,
  numberSchema,
  nestedErrorSchema,
  simpleUserSchema,
} from "../fixtures/schemas";
import { describe, expect, it, vi } from "../setup";

describe("Basic Workflows", () => {
  describe("Happy path scenarios", () => {
    it("should execute a simple action successfully", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("hello world");

      expect(result).toEqual({
        success: true,
        data: "HELLO WORLD",
      });
    });

    it("should handle actions without input schema", async () => {
      const action = create()
        .action(async () => {
          return { message: "success", timestamp: Date.now() };
        })
        .craft();

      const result = await action();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("success");
        expect(typeof result.data.timestamp).toBe("number");
      }
    });

    it("should handle output validation", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "TEST",
      });
    });
  });

  describe("Validation error scenarios", () => {
    it("should return validation error for invalid input", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await action(123); // Should fail string validation

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("formErrors" in result.error || "issues" in result.error).toBe(
          true,
        );
      }
    });

    it("should format validation errors as flattened by default", async () => {
      const action = create()
        .schemas({ inputSchema: nestedErrorSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await action({ invalid: "data" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should format validation errors as flattened when configured", async () => {
      const action = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: nestedErrorSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await action({ invalid: "data" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("issues" in result.error).toBe(true);
      }
    });
  });

  describe("Custom error scenarios", () => {
    it("should handle custom errors from action", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .errors({
          notFound: (id: string) =>
            ({
              type: "NOT_FOUND",
              id,
            }) as const,
        })
        .action(async ({ input, errors }) => {
          if (input === "missing") {
            return errors.notFound(input as string);
          }
          return input;
        })
        .craft();

      const result = await action("missing");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "NOT_FOUND",
          id: "missing",
        });
      }
    });

    it("should handle thrown errors with custom handler", async () => {
      const action = create({
        handleThrownError: (error: unknown) =>
          ({
            type: "CUSTOM_THROWN_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          }) as const,
      })
        .action(async () => {
          throw new Error("Something went wrong!");
        })
        .craft();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "CUSTOM_THROWN_ERROR",
          message: "Something went wrong!",
        });
      }
    });

    it("should handle thrown errors with default handler", async () => {
      const action = create()
        .action(async () => {
          throw new Error("Something went wrong!");
        })
        .craft();

      const result = await action();

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
      const action = create({
        resultFormat: "functional",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("test");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe("TEST");
      }
    });

    it("should return api Result by default", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("test");

      expect(result).toEqual({
        success: true,
        data: "TEST",
      });
    });
  });

  describe("Callback execution", () => {
    it("should execute onSuccess callback", async () => {
      const onSuccessMock = vi.fn();

      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .callbacks({
          onSuccess: onSuccessMock,
        })
        .craft();

      await action("test");

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

      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return input;
        })
        .callbacks({
          onError: onErrorMock,
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      await action(123); // Invalid input

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

      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return input;
        })
        .callbacks({
          onSettled: onSettledMock,
        })
        .craft();

      // Test success case
      await action("valid");
      expect(onSettledMock).toHaveBeenCalledWith({
        result: { success: true, data: "valid" },
        metadata: expect.objectContaining({
          rawInput: "valid",
          validatedInput: "valid",
        }),
      });

      onSettledMock.mockClear();

      // Test error case
      // @ts-expect-error - Testing invalid input
      await action(123);
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
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, simpleUserSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [multiplier, user] = bindArgs;
          const result = (input as string).repeat(multiplier as number);
          return `${(user as { name: string }).name}: ${result}`;
        })
        .craft();

      const result = await action(42, { name: "John", age: 30 }, "Hi");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain("John:");
        expect(result.data).toContain("Hi");
      }
    });

    it("should handle bind arguments without input schema", async () => {
      let capturedMetadata: unknown;

      const action = create()
        .schemas({
          bindSchemas: [numberSchema, simpleUserSchema] as const,
          // No inputSchema
        })
        .action(async ({ bindArgs, metadata }) => {
          capturedMetadata = metadata;
          const [multiplier, user] = bindArgs;
          return `${(user as { name: string }).name} x${multiplier as number}`;
        })
        .craft();

      const result = await action(3, { name: "Alice", age: 25 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Alice x3");
      }

      // Action metadata contains rawInput, rawBindArgs, and prevState
      expect(capturedMetadata).toEqual({
        rawInput: undefined,
        rawBindArgs: [3, { name: "Alice", age: 25 }],
        prevState: undefined,
      });
    });

    it("should handle bind arguments without input schema but extra parameter", async () => {
      // Test edge case: what if someone passes extra parameters?
      let capturedMetadata: unknown;

      const action = create()
        .schemas({
          bindSchemas: [numberSchema] as const,
          // No inputSchema
        })
        .action(async ({ bindArgs, metadata }) => {
          capturedMetadata = metadata;
          const [multiplier] = bindArgs;
          return `Result x${multiplier as number}`;
        })
        .craft();

      // Call with extra parameter that shouldn't be treated as input
      const result = await action(5, "extraParameter");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Result x5");
      }

      // The extra parameter should be captured as rawInput for metadata
      expect(capturedMetadata).toEqual({
        rawInput: "extraParameter",
        rawBindArgs: [5],
        prevState: undefined,
      });
    });
  });

  describe("Output validation scenarios", () => {
    it("should handle output validation errors (client-facing)", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: numberSchema, // Expect number output
        })
        .action(async ({ input }) => {
          // Return string instead of number - should fail output validation
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("test");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
        expect((result.error as any).message).toBe(
          "An unhandled error occurred",
        );
      }
    });

    it("should handle output validation with nested format (client-facing)", async () => {
      const action = create({
        validationErrorFormat: "nested",
      })
        .schemas({
          outputSchema: simpleUserSchema, // Expect user object
        })
        .action(async () => {
          // Return invalid user object
          return { invalidField: "value" };
        })
        .craft();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle output validation with flattened format (client-facing)", async () => {
      const action = create({
        validationErrorFormat: "flattened",
      })
        .schemas({
          outputSchema: simpleUserSchema, // Expect user object
        })
        .action(async () => {
          // Return invalid user object
          return { invalidField: "value" };
        })
        .craft();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should pass output validation with valid data", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
        })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("hello");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("HELLO");
      }
    });
  });

  describe("Complex bind arguments scenarios", () => {
    it("should handle bind args validation errors with nested format", async () => {
      const action = create({
        validationErrorFormat: "nested",
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, stringSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [num, str] = bindArgs;
          return `${str as string}: ${(input as string).repeat(num as number)}`;
        })
        .craft();

      // @ts-expect-error - Testing invalid bind args
      const result = await action("invalid", "test", "Hi"); // First bind arg should be number

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("formErrors" in result.error).toBe(true);
        expect("fieldErrors" in result.error).toBe(true);
      }
    });

    it("should handle bind args validation errors with flattened format", async () => {
      const action = create({
        validationErrorFormat: "flattened",
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, stringSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [num, str] = bindArgs;
          return `${str as string}: ${(input as string).repeat(num as number)}`;
        })
        .craft();

      // @ts-expect-error - Testing invalid bind args
      const result = await action("invalid", "test", "Hi"); // First bind arg should be number

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should handle complex bind args with multiple schemas", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, simpleUserSchema, stringSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [multiplier, user, prefix] = bindArgs;
          const repeated = (input as string).repeat(multiplier as number);
          return `${prefix as string} ${
            (user as { name: string }).name
          }: ${repeated}`;
        })
        .craft();

      const result = await action(
        2,
        { name: "Alice", age: 30 },
        "Hello",
        "test",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Hello Alice: testtest");
      }
    });

    it("should handle empty bind args array", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [] as const, // Empty bind schemas
        })
        .action(async ({ input, bindArgs }) => {
          expect(bindArgs).toEqual([]);
          return `Input: ${input as string}`;
        })
        .craft();

      const result = await action("test");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Input: test");
      }
    });
  });

  describe("useActionState workflows", () => {
    it("should handle useActionState signature without bind args", async () => {
      const action = create({
        useActionState: true,
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input, metadata }) => {
          expect(metadata.prevState).toBeDefined();
          return (input as string).toUpperCase();
        })
        .craft();

      const previousState = { success: true as const, data: "previous" };
      const result = await action(previousState, "hello");

      expect(result).toEqual({
        success: true,
        data: "HELLO",
        values: "hello",
      });
    });

    it("should handle useActionState signature with bind args", async () => {
      const action = create({
        useActionState: true,
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .action(async ({ input, bindArgs, metadata }) => {
          expect(metadata.prevState).toBeDefined();
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .craft();

      const previousState = {
        success: false as const,
        error: { type: "UNHANDLED" as const, message: "Previous error" },
      };
      const result = await action(3, previousState as any, "Hi");

      expect(result).toEqual({
        success: true,
        data: "HiHiHi",
        values: "Hi",
      });
    });

    it("should handle useActionState with complex bind args", async () => {
      const action = create({
        useActionState: true,
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, simpleUserSchema] as const,
        })
        .action(async ({ input, bindArgs, metadata }) => {
          expect(metadata.prevState).toBeDefined();
          const [multiplier, user] = bindArgs;
          const repeated = (input as string).repeat(multiplier as number);
          return `${(user as { name: string }).name}: ${repeated}`;
        })
        .craft();

      const previousState = { success: true as const, data: "previous result" };
      const result = await action(
        2,
        { name: "Bob", age: 25 },
        previousState as any,
        "test",
      );

      expect(result).toEqual({
        success: true,
        data: "Bob: testtest",
        values: "test",
      });
    });

    it("should ignore resultFormat when useActionState is true", async () => {
      const action = create({
        useActionState: true,
        resultFormat: "functional",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const previousState = { success: true as const, data: "prev" };
      const result = await action(previousState, "hello");

      // Should return StatefulApiResult, not functional Result
      expect(result).toEqual({
        success: true,
        data: "HELLO",
        values: "hello",
      });
    });
  });

  describe("Error propagation and handling", () => {
    it("should propagate custom errors through callbacks", async () => {
      const onErrorMock = vi.fn();
      const onSettledMock = vi.fn();

      const action = create()
        .errors({
          businessError: (message: string) =>
            ({
              type: "BUSINESS_ERROR",
              message,
            }) as const,
        })
        .action(async ({ errors }) => {
          return errors.businessError("Business logic failed");
        })
        .callbacks({
          onError: onErrorMock,
          onSettled: onSettledMock,
        })
        .craft();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "BUSINESS_ERROR",
          message: "Business logic failed",
        });
      }

      expect(onErrorMock).toHaveBeenCalledWith({
        error: {
          type: "BUSINESS_ERROR",
          message: "Business logic failed",
        },
        metadata: expect.any(Object),
      });

      expect(onSettledMock).toHaveBeenCalledWith({
        result: expect.objectContaining({ success: false }),
        metadata: expect.any(Object),
      });
    });

    it("should handle multiple error types in single action", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .errors({
          notFound: (id: string) => ({ type: "NOT_FOUND", id }) as const,
          unauthorized: () => ({ type: "UNAUTHORIZED" }) as const,
          validation: (field: string) =>
            ({ type: "VALIDATION", field }) as const,
        })
        .action(async ({ input, errors }) => {
          const str = input as string;
          if (str === "missing") return errors.notFound(str);
          if (str === "forbidden") return errors.unauthorized();
          if (str === "invalid") return errors.validation("input");
          return str.toUpperCase();
        })
        .craft();

      // Test each error type
      const notFoundResult = await action("missing");
      expect(notFoundResult.success).toBe(false);
      if (!notFoundResult.success) {
        expect(notFoundResult.error.type).toBe("NOT_FOUND");
      }

      const unauthorizedResult = await action("forbidden");
      expect(unauthorizedResult.success).toBe(false);
      if (!unauthorizedResult.success) {
        expect(unauthorizedResult.error.type).toBe("UNAUTHORIZED");
      }

      const validationResult = await action("invalid");
      expect(validationResult.success).toBe(false);
      if (!validationResult.success) {
        expect(validationResult.error.type).toBe("VALIDATION");
      }

      // Test success case
      const successResult = await action("valid");
      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.data).toBe("VALID");
      }
    });

    it("should handle thrown errors during validation", async () => {
      const action = create({
        handleThrownError: (error: unknown) =>
          ({
            type: "VALIDATION_THROW_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          }) as const,
      })
        .action(async () => {
          // Simulate a thrown error during action execution
          throw new Error("Schema validation threw an error");
        })
        .craft();

      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("VALIDATION_THROW_ERROR");
        expect((result.error as any).message).toBe(
          "Schema validation threw an error",
        );
      }
    });
  });

  describe("Metadata handling", () => {
    it("should provide correct metadata in all scenarios", async () => {
      let capturedActionMetadata: unknown;
      let capturedCallbackMetadata: unknown;

      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .action(async ({ input, bindArgs, metadata }) => {
          capturedActionMetadata = metadata;
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .callbacks({
          onSuccess: ({ metadata }) => {
            capturedCallbackMetadata = metadata;
          },
        })
        .craft();

      await action(3, "Hi");

      // Action metadata should have rawInput, rawBindArgs, and prevState
      expect(capturedActionMetadata).toEqual({
        rawInput: "Hi",
        rawBindArgs: [3],
        prevState: undefined,
      });

      // Callback metadata should have all fields including validated data
      expect(capturedCallbackMetadata).toEqual({
        rawInput: "Hi",
        rawBindArgs: [3],
        validatedInput: "Hi",
        validatedBindArgs: [3],
        prevState: undefined,
      });
    });

    it("should handle metadata with useActionState", async () => {
      let capturedActionMetadata: unknown;
      let capturedCallbackMetadata: unknown;

      const action = create({
        useActionState: true,
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .action(async ({ input, bindArgs, metadata }) => {
          capturedActionMetadata = metadata;
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .callbacks({
          onSuccess: ({ metadata }) => {
            capturedCallbackMetadata = metadata;
          },
        })
        .craft();

      const previousState = { success: true as const, data: "previous" };
      await action(2, previousState, "test");

      // Action metadata should include rawBindArgs and prevState
      expect(capturedActionMetadata).toEqual({
        rawInput: "test",
        rawBindArgs: [2],
        prevState: previousState,
      });

      // Callback metadata should have all fields
      expect(capturedCallbackMetadata).toEqual({
        rawInput: "test",
        rawBindArgs: [2],
        validatedInput: "test",
        validatedBindArgs: [2],
        prevState: previousState,
      });
    });
  });
});
