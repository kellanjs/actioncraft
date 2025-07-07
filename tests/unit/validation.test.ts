import { create } from "../../src/actioncraft";
import {
  stringSchema,
  numberSchema,
  nestedSchema,
  strictSchema,
  validNestedData,
} from "../fixtures/schemas";
import { describe, it, expect } from "../setup";
import { z } from "zod/v4";

describe("Input Validation", () => {
  describe("Basic Validation", () => {
    it("should pass with valid input", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      const result = await action("hello world");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("HELLO WORLD");
      }
    });

    it("should fail with invalid input", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      // @ts-expect-error - Testing invalid input
      const result = await action(123);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle complex object validation", async () => {
      const action = create()
        .schemas({ inputSchema: nestedSchema })
        .action(async ({ input }) => {
          const data = input as typeof validNestedData;
          return `Hello ${data.user.profile.name}`;
        })
        .craft();

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
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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

      const numberAction = create()
        .schemas({ inputSchema: anyNumberSchema })
        .action(async ({ input }) => {
          return (input as number) * 2;
        })
        .craft();

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
      const positiveAction = create()
        .schemas({ inputSchema: numberSchema })
        .action(async ({ input }) => {
          return (input as number) * 2;
        })
        .craft();

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

      const action = create()
        .schemas({ inputSchema: objectSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      // Test empty object
      const emptyObjectResult = await action({});
      expect(emptyObjectResult.success).toBe(true);

      // Test empty array
      const emptyArrayResult = await action([]);
      expect(emptyArrayResult.success).toBe(true);
    });

    it("should allow optional input to be omitted when schema allows", async () => {
      const optionalStringSchema = z.string().optional();

      const action = create()
        .schemas({ inputSchema: optionalStringSchema })
        .action(async ({ input }) => {
          return input ? `Got: ${input}` : "NO_INPUT";
        })
        .craft();

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

  describe("Validation Error Formatting", () => {
    it("should format errors as flattened by default", async () => {
      const action = create()
        .schemas({ inputSchema: strictSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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
      const action = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: strictSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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
      const action = create()
        .schemas({ inputSchema: nestedSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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

      const action = create()
        .schemas({ inputSchema: singleFieldSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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

      const action = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: singleFieldSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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
      const defaultAction = create()
        .schemas({ inputSchema: multiIssueSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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
      const nestedAction = create({
        validationErrorFormat: "nested",
      })
        .schemas({ inputSchema: multiIssueSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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
      const flattenedAction = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: multiIssueSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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

  describe("Bind Argument Validation", () => {
    it("should validate bind arguments successfully", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, stringSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [multiplier, prefix] = bindArgs;
          return `${prefix as string}: ${(input as string).repeat(
            multiplier as number,
          )}`;
        })
        .craft();

      const result = await action(3, "Test", "Hi");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Test: HiHiHi");
      }
    });

    it("should return a BIND_ARGS_VALIDATION_ERROR for invalid bind args", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, stringSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [multiplier, prefix] = bindArgs;
          return `${prefix as string}: ${(input as string).repeat(
            multiplier as number,
          )}`;
        })
        .craft();

      // @ts-expect-error - Testing invalid bind args
      const result = await action("invalid", "Test", "Hi"); // First bind arg should be number
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle mixed valid and invalid bind args with BIND_ARGS_VALIDATION", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema, stringSchema, numberSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const _unused = { input, bindArgs };
          return "success";
        })
        .craft();

      // Second bind arg is invalid (should be string, not number)
      // @ts-expect-error - Testing invalid bind args
      const result = await action(5, 123, 10, "test");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should work without input schema but with bind args", async () => {
      const action = create()
        .schemas({
          bindSchemas: [stringSchema, numberSchema] as const,
        })
        .action(async ({ bindArgs }) => {
          const [name, age] = bindArgs;
          return `${name as string} is ${age as number} years old`;
        })
        .craft();

      const result = await action("Alice", 25);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Alice is 25 years old");
      }
    });

    it("should distinguish between input validation and bind args validation errors", async () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [numberSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [multiplier] = bindArgs;
          return (input as string).repeat(multiplier as number);
        })
        .craft();

      // Test bind args validation error
      // @ts-expect-error - Testing invalid bind args
      const bindArgsError = await action("invalid", "test"); // First arg should be number
      expect(bindArgsError.success).toBe(false);
      if (!bindArgsError.success) {
        expect(bindArgsError.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Test input validation error
      // @ts-expect-error - Testing invalid input
      const inputError = await action(5, 123); // Second arg should be string
      expect(inputError.success).toBe(false);
      if (!inputError.success) {
        expect(inputError.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle bind args validation with nested and flattened formats", async () => {
      const complexBindSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (
              typeof input === "object" &&
              input !== null &&
              "name" in input &&
              "value" in input
            ) {
              const obj = input as { name: unknown; value: unknown };
              if (
                typeof obj.name === "string" &&
                typeof obj.value === "number"
              ) {
                return { value: input };
              }
            }
            return {
              issues: [
                { message: "Must have string name and number value", path: [] },
              ],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      // Test flattened format (default)
      const defaultAction = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [complexBindSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          return `${input}: ${JSON.stringify(bindArgs[0])}`;
        })
        .craft();

      const defaultResult = await defaultAction({ invalid: "data" }, "test");
      expect(defaultResult.success).toBe(false);
      if (!defaultResult.success) {
        expect(defaultResult.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("issues" in defaultResult.error).toBe(true);
      }

      // Test nested format when explicitly configured
      const nestedAction = create({
        validationErrorFormat: "nested",
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [complexBindSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          return `${input}: ${JSON.stringify(bindArgs[0])}`;
        })
        .craft();

      const nestedResult = await nestedAction({ invalid: "data" }, "test");
      expect(nestedResult.success).toBe(false);
      if (!nestedResult.success) {
        expect(nestedResult.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("formErrors" in nestedResult.error).toBe(true);
        expect("fieldErrors" in nestedResult.error).toBe(true);
      }

      // Test flattened format
      const flattenedAction = create({
        validationErrorFormat: "flattened",
      })
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [complexBindSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          return `${input}: ${JSON.stringify(bindArgs[0])}`;
        })
        .craft();

      const flattenedResult = await flattenedAction(
        { invalid: "data" },
        "test",
      );
      expect(flattenedResult.success).toBe(false);
      if (!flattenedResult.success) {
        expect(flattenedResult.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("issues" in flattenedResult.error).toBe(true);
      }
    });

    it("should handle single bind arg validation", async () => {
      const action = create()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .action(async ({ bindArgs }) => {
          const [message] = bindArgs;
          return `Message: ${message as string}`;
        })
        .craft();

      // Valid single bind arg
      const validResult = await action("Hello World");
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toBe("Message: Hello World");
      }

      // Invalid single bind arg
      // @ts-expect-error - Testing invalid bind args
      const invalidResult = await action(123);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle multiple bind args with partial failures", async () => {
      const action = create()
        .schemas({
          bindSchemas: [stringSchema, numberSchema, stringSchema] as const,
        })
        .action(async ({ bindArgs }) => {
          const [first, second, third] = bindArgs;
          return `${first}: ${second} -> ${third}`;
        })
        .craft();

      // All valid
      const validResult = await action("Start", 42, "End");
      expect(validResult.success).toBe(true);

      // First invalid
      // @ts-expect-error - Testing invalid bind args
      const firstInvalidResult = await action(123, 42, "End");
      expect(firstInvalidResult.success).toBe(false);
      if (!firstInvalidResult.success) {
        expect(firstInvalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Middle invalid
      // @ts-expect-error - Testing invalid bind args
      const middleInvalidResult = await action("Start", "not-number", "End");
      expect(middleInvalidResult.success).toBe(false);
      if (!middleInvalidResult.success) {
        expect(middleInvalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Last invalid
      // @ts-expect-error - Testing invalid bind args
      const lastInvalidResult = await action("Start", 42, 999);
      expect(lastInvalidResult.success).toBe(false);
      if (!lastInvalidResult.success) {
        expect(lastInvalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });
  });

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

      const action = create()
        .schemas({ inputSchema: permissiveSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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

      const action = create()
        .schemas({ inputSchema: transformingSchema })
        .action(async ({ input }) => {
          return `Transformed: ${input as string}`;
        })
        .craft();

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

      const defaultAction = create()
        .schemas({ inputSchema: rootErrorSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      const nestedAction = create({
        validationErrorFormat: "nested",
      })
        .schemas({ inputSchema: rootErrorSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

      const flattenedAction = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: rootErrorSchema })
        .action(async ({ input }) => {
          return input;
        })
        .craft();

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
});
