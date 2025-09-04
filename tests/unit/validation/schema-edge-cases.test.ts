import { craft } from "../../../src/index";
import { describe, it, expect } from "../../setup";

describe("Schema Edge Cases", () => {
  it("should handle schemas that return no issues for invalid data", async () => {
    const permissiveSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          // Always succeeds, regardless of input
          return { value: input };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const action = craft((action) =>
      action
        .schemas({ inputSchema: permissiveSchema })
        .handler(async ({ input }) => {
          return input;
        }),
    );

    // Should succeed with any input
    const result1 = await action("string");
    const result2 = await action(123);
    const result3 = await action({ any: "object" });
    const result4 = await action(null);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result3.success).toBe(true);
    expect(result4.success).toBe(true);
  });

  it("should handle schemas with transformation", async () => {
    const transformingSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          if (typeof input === "string") {
            return { value: input.toUpperCase() };
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
        .schemas({ inputSchema: transformingSchema })
        .handler(async ({ input }) => {
          return `Transformed: ${input as string}`;
        }),
    );

    const result = await action("hello world");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Transformed: HELLO WORLD");
    }
  });

  it("should handle schemas with empty path in issues", async () => {
    const rootErrorSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input: unknown) => {
          if (input === "valid") {
            return { value: input };
          }
          return {
            issues: [{ message: "Root level error", path: [] }],
          };
        },
      },
      "~validate": function (input: unknown) {
        return this["~standard"].validate(input);
      },
    } as const;

    const defaultAction = craft((action) =>
      action
        .schemas({ inputSchema: rootErrorSchema })
        .handler(async ({ input }) => {
          return input;
        }),
    );

    const nestedAction = craft((action) =>
      action
        .config({
          validationErrorFormat: "nested",
        })
        .schemas({ inputSchema: rootErrorSchema })
        .handler(async ({ input }) => {
          return input;
        }),
    );

    const flattenedAction = craft((action) =>
      action
        .config({
          validationErrorFormat: "flattened",
        })
        .schemas({ inputSchema: rootErrorSchema })
        .handler(async ({ input }) => {
          return input;
        }),
    );

    const defaultResult = await defaultAction("invalid");
    expect(defaultResult.success).toBe(false);
    if (!defaultResult.success) {
      expect(defaultResult.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in defaultResult.error).toBe(true);
    }

    const nestedResult = await nestedAction("invalid");
    expect(nestedResult.success).toBe(false);
    if (!nestedResult.success) {
      expect(nestedResult.error.type).toBe("INPUT_VALIDATION");
      expect("formErrors" in nestedResult.error).toBe(true);
    }

    const flattenedResult = await flattenedAction("invalid");
    expect(flattenedResult.success).toBe(false);
    if (!flattenedResult.success) {
      expect(flattenedResult.error.type).toBe("INPUT_VALIDATION");
      expect("issues" in flattenedResult.error).toBe(true);
    }
  });
});
