import { craft } from "../../../src/index";
import { stringSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";

describe("Thrown Error Handling", () => {
  it("should handle thrown errors with a custom handler", async () => {
    const customErrorHandler = (error: unknown) =>
      ({
        type: "CUSTOM_THROWN_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }) as const;

    const action = craft((action) =>
      action
        .config({
          handleThrownError: customErrorHandler,
        })
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          if (input === "throw") {
            throw new Error("Intentional test error");
          }
          return input;
        }),
    );

    const result = await action("throw");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("CUSTOM_THROWN_ERROR");
      const error = result.error as {
        type: "CUSTOM_THROWN_ERROR";
        message: string;
        stack?: string;
      };
      expect(error.message).toBe("Intentional test error");
      expect(error.stack).toBeDefined();
    }
  });

  it("should use the default unhandled error for uncaught exceptions", async () => {
    const action = craft((action) =>
      action
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          if (input === "throw") {
            throw new Error("Uncaught error");
          }
          return input;
        }),
    );

    const result = await action("throw");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({
        type: "UNHANDLED",
        message: "An unhandled error occurred",
      });
    }
  });

  it("should handle non-Error objects being thrown", async () => {
    const customErrorHandler = (error: unknown) =>
      ({
        type: "THROWN_NON_ERROR",
        value: error,
        valueType: typeof error,
      }) as const;

    const action = craft((action) =>
      action
        .config({
          handleThrownError: customErrorHandler,
        })
        .handler(async () => {
          throw "string error";
        }),
    );

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error as any;
      expect(err.type).toBe("THROWN_NON_ERROR");
      expect(err.value).toBe("string error");
      expect(err.valueType).toBe("string");
    }
  });

  it("should handle async thrown errors", async () => {
    const action = craft((action) =>
      action
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "ASYNC_ERROR",
              message:
                error instanceof Error ? error.message : "Unknown async error",
            }) as const,
        })
        .handler(async () => {
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Async failure")), 10);
          });
          return "success";
        }),
    );

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("ASYNC_ERROR");
      expect(result.error.message).toBe("Async failure");
    }
  });

  it("should handle different types of thrown objects", async () => {
    const universalErrorHandler = (error: unknown) =>
      ({
        type: "UNIVERSAL_ERROR",
        originalError: error,
        errorType: typeof error,
        isError: error instanceof Error,
        isString: typeof error === "string",
        isNumber: typeof error === "number",
        isObject: typeof error === "object" && error !== null,
      }) as const;

    const createAction = (throwValue: unknown) =>
      craft((action) =>
        action
          .config({
            handleThrownError: universalErrorHandler,
          })
          .handler(async () => {
            throw throwValue;
          }),
      );

    // Test different thrown types
    const testCases = [
      {
        value: new Error("Error object"),
        expectedType: "object",
        isError: true,
      },
      { value: "String error", expectedType: "string", isError: false },
      { value: 404, expectedType: "number", isError: false },
      { value: { custom: "error" }, expectedType: "object", isError: false },
      { value: null, expectedType: "object", isError: false },
      { value: undefined, expectedType: "undefined", isError: false },
      { value: true, expectedType: "boolean", isError: false },
    ];

    for (const testCase of testCases) {
      const action = createAction(testCase.value);
      const result = await action();

      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as any;
        expect(err.type).toBe("UNIVERSAL_ERROR");
        expect(err.errorType).toBe(testCase.expectedType);
        expect(err.isError).toBe(testCase.isError);
      }
    }
  });

  it("should handle errors thrown during input validation", async () => {
    const throwingSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          if (input === "throw-in-validation") {
            throw new Error("Validation threw an error");
          }
          if (typeof input === "string") {
            return { value: input };
          }
          return {
            issues: [{ message: "Must be a string", path: [] }],
          };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const action = craft((action) =>
      action
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "VALIDATION_THROW_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown validation error",
            }) as const,
        })
        .schemas({ inputSchema: throwingSchema })
        .handler(async ({ input }) => {
          return input;
        }),
    );

    const result = await action("throw-in-validation");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("VALIDATION_THROW_ERROR");
      expect(result.error.message).toBe("Validation threw an error");
    }
  });

  it("should handle errors in custom error handlers themselves", async () => {
    const faultyErrorHandler = (_error: unknown) => {
      // This error handler itself throws an error
      throw new Error("Error handler failed");
    };

    const action = craft((action) =>
      action
        .config({
          handleThrownError: faultyErrorHandler,
        })
        .handler(async () => {
          throw new Error("Original error");
        }),
    );

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should fall back to default unhandled error when error handler fails
      expect(result.error).toEqual({
        type: "UNHANDLED",
        message: "An unhandled error occurred",
      });
    }
  });
});
