import { craft } from "../../src/index.js";
import { stringSchema, userSchema } from "../fixtures/schemas.js";
import { describe, it, expect } from "vitest";

describe("Async craft function", () => {
  it("should support async builder functions", async () => {
    const action = craft(async (action) => {
      return action
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Hello ${input}!`;
        });
    });

    const result = await action("World");
    expect(result).toEqual({
      success: true,
      data: "Hello World!",
      __ac_id: expect.any(String),
    });
  });

  it("should support async builder functions with complex schemas", async () => {
    const action = craft(async (action) => {
      return action
        .schemas({
          inputSchema: userSchema,
        })
        .handler(async ({ input }) => {
          return {
            id: "123",
            ...input,
            createdAt: new Date(),
          };
        });
    });

    const result = await action({
      name: "John Doe",
      email: "john@example.com",
      age: 30,
    });

    expect(result).toEqual({
      success: true,
      data: {
        id: "123",
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        createdAt: expect.any(Date),
      },
      __ac_id: expect.any(String),
    });
  });

  it("should support async builder functions with errors", async () => {
    const action = craft(async (action) => {
      return action
        .schemas({
          inputSchema: stringSchema,
        })
        .errors({
          notFound: (id: string) => ({
            type: "NOT_FOUND" as const,
            message: `Item ${id} not found`,
          }),
        })
        .handler(async ({ input, errors }) => {
          if (input === "missing") {
            return errors.notFound(input);
          }
          return `Found: ${input}`;
        });
    });

    // Test success case
    const successResult = await action("test");
    expect(successResult).toEqual({
      success: true,
      data: "Found: test",
      __ac_id: expect.any(String),
    });

    // Test error case
    const errorResult = await action("missing");
    expect(errorResult).toEqual({
      success: false,
      error: {
        type: "NOT_FOUND",
        message: "Item missing not found",
      },
      __ac_id: expect.any(String),
    });
  });

  it("should support async builder functions with callbacks", async () => {
    let callbackData: any = null;

    const action = craft(async (action) => {
      return action
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input }) => {
          return `Processed: ${input}`;
        })
        .callbacks({
          onSuccess: ({ data }) => {
            callbackData = data;
          },
        });
    });

    const result = await action("test");

    expect(result).toEqual({
      success: true,
      data: "Processed: test",
      __ac_id: expect.any(String),
    });

    expect(callbackData).toBe("Processed: test");
  });

  it("should preserve action metadata for async actions", async () => {
    const action = craft(async (action) => {
      return action
        .config({
          resultFormat: "api" as const,
        })
        .handler(async () => {
          return "test";
        });
    });

    // Wait a bit for the async metadata assignment to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check that the action has the expected metadata
    expect((action as any).__ac_config).toBeDefined();
    expect((action as any).__ac_id).toBeDefined();
  });
});
