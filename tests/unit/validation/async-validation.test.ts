import { actioncraft } from "../../../src/index";
import { describe, it, expect } from "vitest";

// -----------------------------------------------------------------------------
// Helper – asynchronous Standard Schema that resolves after a short delay
// -----------------------------------------------------------------------------
const asyncStringSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "async-test",
    validate: async (value: unknown) => {
      // Simulate async workload
      await new Promise((r) => setTimeout(r, 5));
      if (typeof value === "string") {
        return { value } as const;
      }
      return {
        issues: [
          {
            message: "Must be a string",
            path: [],
          },
        ],
      } as const;
    },
    // Provide explicit input/output types so TypeScript can detect mismatches
    types: {
      input: "" as string,
      output: "" as string,
    },
  },
  // Convenience helper so the schema can also be invoked directly
  "~validate"(input: unknown) {
    return this["~standard"].validate(input);
  },
} as const;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("Async Schema Validation", () => {
  it("should validate input using an async schema", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: asyncStringSchema })
      .handler(async ({ input }) => (input as string).toUpperCase())
      .build();

    const result = await action("hello");
    expect(result).toEqual({
      success: true,
      data: "HELLO",
      __ac_id: expect.any(String),
    });
  });

  it("should return INPUT_VALIDATION error for invalid async input", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: asyncStringSchema })
      .handler(async ({ input }) => input)
      .build();

    // @ts-expect-error – invalid input on purpose
    const result = await action(123);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
    }
  });

  it("should validate async bind args", async () => {
    const action = actioncraft()
      .schemas({ bindSchemas: [asyncStringSchema] as const })
      .handler(async ({ bindArgs }) => `arg:${bindArgs[0]}`)
      .build();

    const ok = await action("test");
    expect(ok).toEqual({
      success: true,
      data: "arg:test",
      __ac_id: expect.any(String),
    });

    // @ts-expect-error – invalid bind arg
    const bad = await action(42);
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.type).toBe("BIND_ARGS_VALIDATION");
    }
  });

  it("should propagate OUTPUT_VALIDATION errors coming from async schema", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: asyncStringSchema,
        outputSchema: asyncStringSchema,
      })
      // Intentionally return a wrong type to fail output validation
      .handler(async () => 123 as unknown)
      .build();

    const result = await action("valid-input");

    expect(result.success).toBe(false);
    if (!result.success) {
      // Internal OUTPUT_VALIDATION errors are mapped to UNHANDLED externally
      expect(result.error.type).toBe("UNHANDLED");
    }
  });
});
