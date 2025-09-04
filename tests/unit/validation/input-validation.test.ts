import { craft } from "../../../src/index";
import {
  stringSchema,
  numberSchema,
  nestedSchema,
  validNestedData,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";
import { z } from "zod";

describe("Input Validation", () => {
  describe("Basic Validation", () => {
    it("should pass with valid input", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return (input as string).toUpperCase();
          }),
      );

      const result = await action("hello world");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("HELLO WORLD");
      }
    });

    it("should fail with invalid input", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return input;
          }),
      );

      // @ts-expect-error - Testing invalid input
      const result = await action(123);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle complex object validation", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: nestedSchema })
          .handler(async ({ input }) => {
            const data = input as typeof validNestedData;
            return `Hello ${data.user.profile.name}`;
          }),
      );

      // Test valid nested data
      const validResult = await action(validNestedData);
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toBe("Hello John");
      }

      // Test invalid nested data
      const invalidNestedData = {
        user: {
          profile: {
            name: "", // Invalid: empty string
          },
          settings: {
            theme: "invalid", // Invalid: not in enum
            notifications: true,
          },
        },
        metadata: {},
      };

      // @ts-expect-error - Testing invalid input
      const invalidResult = await action(invalidNestedData);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle null and undefined inputs", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return input;
          }),
      );

      // @ts-expect-error - Testing null input
      const nullResult = await action(null);
      expect(nullResult.success).toBe(false);
      if (!nullResult.success) {
        expect(nullResult.error.type).toBe("INPUT_VALIDATION");
      }

      // @ts-expect-error - Testing undefined input
      const undefinedResult = await action(undefined);
      expect(undefinedResult.success).toBe(false);
      if (!undefinedResult.success) {
        expect(undefinedResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle edge case primitive values", async () => {
      // Create a more permissive number schema for edge case testing
      const anyNumberSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "number") {
              return { value: input };
            }
            return {
              issues: [{ message: "Must be a number", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const numberAction = craft((action) =>
        action
          .schemas({ inputSchema: anyNumberSchema })
          .handler(async ({ input }) => {
            return (input as number) * 2;
          }),
      );

      // Test zero
      const zeroResult = await numberAction(0);
      expect(zeroResult.success).toBe(true);
      if (zeroResult.success) {
        expect(zeroResult.data).toBe(0);
      }

      // Test negative numbers
      const negativeResult = await numberAction(-5);
      expect(negativeResult.success).toBe(true);
      if (negativeResult.success) {
        expect(negativeResult.data).toBe(-10);
      }

      // Test positive numbers with the original schema
      const positiveAction = craft((action) =>
        action
          .schemas({ inputSchema: numberSchema })
          .handler(async ({ input }) => {
            return (input as number) * 2;
          }),
      );

      const positiveResult = await positiveAction(5);
      expect(positiveResult.success).toBe(true);
      if (positiveResult.success) {
        expect(positiveResult.data).toBe(10);
      }

      // Test zero with positive schema (should fail)
      const zeroWithPositiveResult = await positiveAction(0);
      expect(zeroWithPositiveResult.success).toBe(false);
      if (!zeroWithPositiveResult.success) {
        expect(zeroWithPositiveResult.error.type).toBe("INPUT_VALIDATION");
      }

      // Test invalid string
      const invalidResult = await numberAction("not-a-number");
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle empty objects and arrays", async () => {
      const objectSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (typeof input === "object" && input !== null) {
              return { value: input };
            }
            return {
              issues: [{ message: "Must be an object", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = craft((action) =>
        action
          .schemas({ inputSchema: objectSchema })
          .handler(async ({ input }) => {
            return input;
          }),
      );

      // Test empty object
      const emptyObjectResult = await action({});
      expect(emptyObjectResult.success).toBe(true);

      // Test empty array
      const emptyArrayResult = await action([]);
      expect(emptyArrayResult.success).toBe(true);
    });

    it("should allow optional input to be omitted when schema allows", async () => {
      const optionalStringSchema = z.string().optional();

      const action = craft((action) =>
        action
          .schemas({ inputSchema: optionalStringSchema })
          .handler(async ({ input }) => {
            return input ? `Got: ${input}` : "NO_INPUT";
          }),
      );

      // Call without providing input (undefined)
      const omittedResult = await action(
        undefined as unknown as string | undefined,
      );
      expect(omittedResult.success).toBe(true);
      if (omittedResult.success) {
        expect(omittedResult.data).toBe("NO_INPUT");
      }

      // Call with valid input
      const validResult = await action("hello");
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toBe("Got: hello");
      }

      // Call with invalid input type
      // @ts-expect-error - Testing invalid input
      const invalidResult = await action(123);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });
});
