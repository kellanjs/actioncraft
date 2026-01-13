import { actioncraft } from "../../../src/index";
import { strictSchema, nestedSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";

describe("Validation Error Formatting", () => {
  it("should format errors as flattened by default", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: strictSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const invalidData = {
      requiredField: "", // Invalid: empty string
      strictNumber: -5, // Invalid: not positive
      restrictedEnum: "invalid", // Invalid: not in enum
    };

    // @ts-expect-error - Testing invalid input
    const result = await action(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in result.error).toBe(true);
    }
  });

  it("should format errors as flattened when configured", async () => {
    const action = actioncraft()
      .config({
        validationErrorFormat: "flattened",
      })
      .schemas({ inputSchema: strictSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const invalidData = {
      requiredField: "", // Invalid: empty string
      strictNumber: -5, // Invalid: not positive
      restrictedEnum: "invalid", // Invalid: not in enum
    };

    // @ts-expect-error - Testing invalid input
    const result = await action(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in result.error).toBe(true);
    }
  });

  it("should handle complex nested validation errors", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: nestedSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    // Create deeply invalid nested data
    const deeplyInvalidData = {
      user: {
        profile: {
          name: "", // Invalid
          bio: null, // Invalid type
        },
        settings: {
          theme: "purple", // Invalid enum value
          notifications: "yes", // Invalid type
        },
      },
      metadata: "not an object", // Invalid type
    };

    // @ts-expect-error - Testing invalid input
    const result = await action(deeplyInvalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      // Should contain nested error information
      expect("formErrors" in result.error || "issues" in result.error).toBe(
        true,
      );
    }
  });

  it("should handle single field validation errors in flattened format by default", async () => {
    const singleFieldSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          if (typeof input === "string" && input.length >= 3) {
            return { value: input };
          }
          return {
            issues: [
              {
                message: "String must be at least 3 characters",
                path: ["value"],
              },
            ],
          };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const action = actioncraft()
      .schemas({ inputSchema: singleFieldSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const result = await action("hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in result.error).toBe(true);
    }
  });

  it("should handle single field validation errors in flattened format", async () => {
    const singleFieldSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          if (typeof input === "string" && input.length >= 3) {
            return { value: input };
          }
          return {
            issues: [
              {
                message: "String must be at least 3 characters",
                path: ["value"],
              },
            ],
          };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const action = actioncraft()
      .config({
        validationErrorFormat: "flattened",
      })
      .schemas({ inputSchema: singleFieldSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const result = await action("hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in result.error).toBe(true);
      if ("issues" in result.error) {
        expect(Array.isArray(result.error.issues)).toBe(true);
      }
    }
  });

  it("should handle multiple validation issues in different formats", async () => {
    const multiIssueSchema = {
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
              issues.push({ message: "Name is required", path: ["name"] });
            }
            if (!obj.age || typeof obj.age !== "number") {
              issues.push({ message: "Age must be a number", path: ["age"] });
            }
            if (obj.email && typeof obj.email !== "string") {
              issues.push({
                message: "Email must be a string",
                path: ["email"],
              });
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

    // Test flattened format (default)
    const defaultAction = actioncraft()
      .schemas({ inputSchema: multiIssueSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const defaultResult = await defaultAction({
      name: 123,
      age: "not-a-number",
      email: true,
    });
    expect(defaultResult.success).toBe(false);
    if (!defaultResult.success) {
      expect(defaultResult.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in defaultResult.error).toBe(true);
    }

    // Test nested format when explicitly configured
    const nestedAction = actioncraft()
      .config({
        validationErrorFormat: "nested",
      })
      .schemas({ inputSchema: multiIssueSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const nestedResult = await nestedAction({
      name: 123,
      age: "not-a-number",
      email: true,
    });
    expect(nestedResult.success).toBe(false);
    if (!nestedResult.success) {
      expect(nestedResult.error.type).toBe("INPUT_VALIDATION");
      expect("formErrors" in nestedResult.error).toBe(true);
      expect("fieldErrors" in nestedResult.error).toBe(true);
    }

    // Test flattened format
    const flattenedAction = actioncraft()
      .config({
        validationErrorFormat: "flattened",
      })
      .schemas({ inputSchema: multiIssueSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    const flattenedResult = await flattenedAction({
      name: 123,
      age: "not-a-number",
      email: true,
    });
    expect(flattenedResult.success).toBe(false);
    if (!flattenedResult.success) {
      expect(flattenedResult.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in flattenedResult.error).toBe(true);
      if ("issues" in flattenedResult.error) {
        expect(Array.isArray(flattenedResult.error.issues)).toBe(true);
        expect(flattenedResult.error.issues.length).toBeGreaterThan(0);
      }
    }
  });
});
