import { craft } from "../../../src/index";
import {
  stringSchema,
  numberSchema,
  alwaysFailSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";

describe("Output Validation Errors", () => {
  it("should return an UNHANDLED_ERROR for invalid output (client-facing)", async () => {
    const action = craft((action) =>
      action
        .schemas({
          inputSchema: stringSchema,
          outputSchema: numberSchema,
        })
        .handler(async ({ input }) => {
          // Return string when number is expected
          return input; // This will fail output validation
        }),
    );

    const result = await action("not-a-number");
    expect(result.success).toBe(false);
    if (!result.success) {
      // Client sees generic unhandled error, not implementation details
      expect(result.error.type).toBe("UNHANDLED");
      expect((result.error as any).message).toBe("An unhandled error occurred");
    }
  });

  it("should handle complex output validation failures (client-facing)", async () => {
    const complexOutputSchema = {
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
            const obj = input as { id: unknown; name: unknown };
            if (typeof obj.id === "string" && typeof obj.name === "string") {
              return { value: obj };
            }
          }
          return {
            issues: [{ message: "Must have string id and name", path: [] }],
          };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const action = craft((action) =>
      action
        .schemas({
          inputSchema: stringSchema,
          outputSchema: complexOutputSchema,
        })
        .handler(async () => {
          return { id: 123, name: "test" }; // id should be string, not number
        }),
    );

    const result = await action("input");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  it("should handle schema that always fails (client-facing)", async () => {
    const action = craft((action) =>
      action
        .schemas({
          inputSchema: stringSchema,
          outputSchema: alwaysFailSchema,
        })
        .handler(async ({ input }) => {
          return input; // This will always fail output validation
        }),
    );

    const result = await action("test");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  it("should handle output validation with flattened error format (client-facing)", async () => {
    const multiFieldOutputSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          const issues: Array<{
            message: string;
            path: (string | number)[];
          }> = [];
          if (typeof input !== "object" || input === null) {
            issues.push({ message: "Must be an object", path: [] });
          } else {
            const obj = input as Record<string, unknown>;
            if (!obj.name || typeof obj.name !== "string") {
              issues.push({
                message: "Name must be a string",
                path: ["name"],
              });
            }
            if (!obj.age || typeof obj.age !== "number") {
              issues.push({ message: "Age must be a number", path: ["age"] });
            }
          }

          if (issues.length > 0) {
            return { issues };
          }
          return { value: input };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const action = craft((action) =>
      action
        .config({
          validationErrorFormat: "flattened",
        })
        .schemas({
          inputSchema: stringSchema,
          outputSchema: multiFieldOutputSchema,
        })
        .handler(async () => {
          return { name: 123, age: "not-a-number" }; // Both fields invalid
        }),
    );

    const result = await action("input");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  it("should handle output validation errors with custom error handler (client-facing)", async () => {
    const action = craft((action) =>
      action
        .config({
          handleThrownError: (error: unknown) =>
            ({
              type: "CUSTOM_OUTPUT_ERROR",
              originalError: error,
            }) as const,
        })
        .schemas({
          inputSchema: stringSchema,
          outputSchema: numberSchema,
        })
        .handler(async ({ input }) => {
          return input; // Will fail output validation
        }),
    );

    const result = await action("not-a-number");
    expect(result.success).toBe(false);
    if (!result.success) {
      // Output validation errors are internal, client sees unhandled error
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  // Test that callbacks receive detailed internal errors
  it("should pass detailed OUTPUT_VALIDATION_ERROR to callbacks", async () => {
    let capturedError: any = null;

    const action = craft((action) =>
      action
        .schemas({
          inputSchema: stringSchema,
          outputSchema: numberSchema,
        })
        .handler(async ({ input }) => {
          return input; // Will fail output validation
        })
        .callbacks({
          onError: ({ error }) => {
            capturedError = error;
          },
        }),
    );

    const result = await action("not-a-number");

    // Client gets generic error
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }

    // But callback gets detailed error
    expect(capturedError).not.toBeNull();
    expect(capturedError.type).toBe("OUTPUT_VALIDATION");
    expect("formErrors" in capturedError || "issues" in capturedError).toBe(
      true,
    );
  });

  it("should pass IMPLICIT_RETURN_ERROR to callbacks but UNHANDLED_ERROR to client", async () => {
    let capturedError: any = null;

    const action = craft((action) =>
      action
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => {
          // Implicit return (undefined) - new UX improvement

          const result = input.toUpperCase();
          // No return statement - this should trigger IMPLICIT_RETURN_ERROR
        })
        .callbacks({
          onError: ({ error }) => {
            capturedError = error;
          },
        }),
    );

    const result = await action("test");

    // Client gets generic error
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }

    // But callback gets detailed error for debugging
    expect(capturedError).not.toBeNull();
    expect(capturedError.type).toBe("IMPLICIT_RETURN");
    expect(capturedError.message).toBe("Action handler must return a value");
  });
});
