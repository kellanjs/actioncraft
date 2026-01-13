import { actioncraft } from "../../../src/index";
import {
  expectSuccessResult,
  expectValidAction,
  commonTestData,
} from "../../__fixtures__/helpers";
import {
  stringSchema,
  numberSchema,
  userSchema,
  nestedSchema,
  arraySchema,
  organizationIdSchema,
  permissionLevelSchema,
  strictSchema,
  alwaysFailSchema,
  validNestedData,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Bind Argument Validation", () => {
  it("should validate bind arguments successfully", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [numberSchema, stringSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        const [multiplier, prefix] = bindArgs;
        return `${prefix as string}: ${(input as string).repeat(
          multiplier as number,
        )}`;
      })
      .build();

    const result = await action(3, "Test", "Hi");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Test: HiHiHi");
    }
  });

  it("should return a BIND_ARGS_VALIDATION_ERROR for invalid bind args", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [numberSchema, stringSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        const [multiplier, prefix] = bindArgs;
        return `${prefix as string}: ${(input as string).repeat(
          multiplier as number,
        )}`;
      })
      .build();

    // @ts-expect-error - Testing invalid bind args
    const result = await action("invalid", "Test", "Hi"); // First bind arg should be number
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
    }
  });

  it("should handle mixed valid and invalid bind args with BIND_ARGS_VALIDATION", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [numberSchema, stringSchema, numberSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        const _unused = { input, bindArgs };
        return "success";
      })
      .build();

    // Second bind arg is invalid (should be string, not number)
    // @ts-expect-error - Testing invalid bind args
    const result = await action(5, 123, 10, "test");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
    }
  });

  it("should work without input schema but with bind args", async () => {
    const action = actioncraft()
      .schemas({
        bindSchemas: [stringSchema, numberSchema] as const,
      })
      .handler(async ({ bindArgs }) => {
        const [name, age] = bindArgs;
        return `${name as string} is ${age as number} years old`;
      })
      .build();

    const result = await action("Alice", 25);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Alice is 25 years old");
    }
  });

  it("should distinguish between input validation and bind args validation errors", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [numberSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        const [multiplier] = bindArgs;
        return (input as string).repeat(multiplier as number);
      })
      .build();

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
            if (typeof obj.name === "string" && typeof obj.value === "number") {
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
    const defaultAction = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [complexBindSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        return `${input}: ${JSON.stringify(bindArgs[0])}`;
      })
      .build();

    const defaultResult = await defaultAction({ invalid: "data" }, "test");
    expect(defaultResult.success).toBe(false);
    if (!defaultResult.success) {
      expect(defaultResult.error.type).toBe("BIND_ARGS_VALIDATION");
      expect("issues" in defaultResult.error).toBe(true);
    }

    // Test nested format when explicitly configured
    const nestedAction = actioncraft()
      .config({
        validationErrorFormat: "nested",
      })
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [complexBindSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        return `${input}: ${JSON.stringify(bindArgs[0])}`;
      })
      .build();

    const nestedResult = await nestedAction({ invalid: "data" }, "test");
    expect(nestedResult.success).toBe(false);
    if (!nestedResult.success) {
      expect(nestedResult.error.type).toBe("BIND_ARGS_VALIDATION");
      expect("formErrors" in nestedResult.error).toBe(true);
      expect("fieldErrors" in nestedResult.error).toBe(true);
    }

    // Test flattened format
    const flattenedAction = actioncraft()
      .config({
        validationErrorFormat: "flattened",
      })
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [complexBindSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        return `${input}: ${JSON.stringify(bindArgs[0])}`;
      })
      .build();

    const flattenedResult = await flattenedAction({ invalid: "data" }, "test");
    expect(flattenedResult.success).toBe(false);
    if (!flattenedResult.success) {
      expect(flattenedResult.error.type).toBe("BIND_ARGS_VALIDATION");
      expect("issues" in flattenedResult.error).toBe(true);
    }
  });

  it("should handle single bind arg validation", async () => {
    const action = actioncraft()
      .schemas({
        bindSchemas: [stringSchema] as const,
      })
      .handler(async ({ bindArgs }) => {
        const [message] = bindArgs;
        return `Message: ${message as string}`;
      })
      .build();

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
    const action = actioncraft()
      .schemas({
        bindSchemas: [stringSchema, numberSchema, stringSchema] as const,
      })
      .handler(async ({ bindArgs }) => {
        const [first, second, third] = bindArgs;
        return `${first}: ${second} -> ${third}`;
      })
      .build();

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

describe("Comprehensive Bind Args Validation", () => {
  describe("Single Bind Argument Validation", () => {
    it("should validate string bind args", async () => {
      const stringAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [message] = bindArgs;
          return `Message: ${message}`;
        })
        .build();

      expectValidAction(stringAction);
      const result = await stringAction("Hello World");
      expectSuccessResult(result, "Message: Hello World");
    });

    it("should validate number bind args", async () => {
      const numberAction = actioncraft()
        .schemas({
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [value] = bindArgs;
          return value * 2;
        })
        .build();

      const result = await numberAction(21);
      expectSuccessResult(result, 42);
    });

    it("should validate complex object bind args", async () => {
      const objectAction = actioncraft()
        .schemas({
          bindSchemas: [userSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [user] = bindArgs;
          return `User: ${user.name} (${user.email})`;
        })
        .build();

      const result = await objectAction(commonTestData.validUser);
      expectSuccessResult(result, "User: John Doe (john@example.com)");
    });

    it("should validate nested object bind args", async () => {
      const nestedAction = actioncraft()
        .schemas({
          bindSchemas: [nestedSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [data] = bindArgs;
          return `Profile: ${data.user.profile.name}`;
        })
        .build();

      const result = await nestedAction(validNestedData);
      expectSuccessResult(result, "Profile: John");
    });

    it("should validate array bind args", async () => {
      const arrayAction = actioncraft()
        .schemas({
          bindSchemas: [arraySchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [data] = bindArgs;
          return data.items.length;
        })
        .build();

      const testData = {
        items: [
          { id: "1", value: 10 },
          { id: "2", value: 20 },
        ],
      };

      const result = await arrayAction(testData);
      expectSuccessResult(result, 2);
    });

    it("should validate enum bind args", async () => {
      const enumAction = actioncraft()
        .schemas({
          bindSchemas: [permissionLevelSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [permission] = bindArgs;
          return `Permission: ${permission}`;
        })
        .build();

      const result = await enumAction("admin");
      expectSuccessResult(result, "Permission: admin");
    });

    it("should validate UUID bind args", async () => {
      const uuidAction = actioncraft()
        .schemas({
          bindSchemas: [organizationIdSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [orgId] = bindArgs;
          return `Organization: ${orgId}`;
        })
        .build();

      const testUuid = "550e8400-e29b-41d4-a716-446655440000";
      const result = await uuidAction(testUuid);
      expectSuccessResult(result, `Organization: ${testUuid}`);
    });
  });

  describe("Multiple Bind Arguments Validation", () => {
    it("should validate multiple primitive bind args", async () => {
      const multiAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema, numberSchema, stringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [prefix, multiplier, suffix] = bindArgs;
          return `${prefix}${"*".repeat(multiplier)}${suffix}`;
        })
        .build();

      const result = await multiAction("Start", 3, "End");
      expectSuccessResult(result, "Start***End");
    });

    it("should validate mixed primitive and object bind args", async () => {
      const mixedAction = actioncraft()
        .schemas({
          bindSchemas: [
            organizationIdSchema,
            userSchema,
            permissionLevelSchema,
          ] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [orgId, user, permission] = bindArgs;
          return `${user.name} has ${permission} access to ${orgId}`;
        })
        .build();

      const testUuid = "550e8400-e29b-41d4-a716-446655440000";
      const result = await mixedAction(
        testUuid,
        commonTestData.validUser,
        "write",
      );
      expectSuccessResult(result, `John Doe has write access to ${testUuid}`);
    });

    it("should validate complex nested bind args", async () => {
      const complexAction = actioncraft()
        .schemas({
          bindSchemas: [nestedSchema, arraySchema, numberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [nested, array, multiplier] = bindArgs;
          return {
            user: nested.user.profile.name,
            itemCount: array.items.length * multiplier,
            theme: nested.user.settings.theme,
          };
        })
        .build();

      const arrayData = {
        items: [
          { id: "1", value: 10 },
          { id: "2", value: 20 },
        ],
      };

      const result = await complexAction(validNestedData, arrayData, 2);
      expectSuccessResult(result, {
        user: "John",
        itemCount: 4,
        theme: "dark",
      });
    });

    it("should handle large number of bind args", async () => {
      const manyArgsAction = actioncraft()
        .schemas({
          bindSchemas: [
            stringSchema,
            numberSchema,
            stringSchema,
            numberSchema,
            stringSchema,
            numberSchema,
            stringSchema,
            numberSchema,
          ] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [s1, n1, s2, n2, s3, n3, s4, n4] = bindArgs;
          return `${s1}${n1}${s2}${n2}${s3}${n3}${s4}${n4}`;
        })
        .build();

      const result = await manyArgsAction("a", 1, "b", 2, "c", 3, "d", 4);
      expectSuccessResult(result, "a1b2c3d4");
    });
  });

  describe("Bind Args with Input Schema Combinations", () => {
    it("should validate bind args with input schema", async () => {
      const combinedAction = actioncraft()
        .schemas({
          inputSchema: userSchema,
          bindSchemas: [organizationIdSchema, permissionLevelSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [orgId, permission] = bindArgs;
          return `${input.name} (${permission}) in org ${orgId}`;
        })
        .build();

      const testUuid = "550e8400-e29b-41d4-a716-446655440000";
      const result = await combinedAction(
        testUuid,
        "admin",
        commonTestData.validUser,
      );
      expectSuccessResult(result, `John Doe (admin) in org ${testUuid}`);
    });

    it("should validate bind args without input schema", async () => {
      const bindOnlyAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema, numberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [name, age] = bindArgs;
          return `${name} is ${age} years old`;
        })
        .build();

      const result = await bindOnlyAction("Alice", 30);
      expectSuccessResult(result, "Alice is 30 years old");
    });

    it("should handle empty bind schemas with input", async () => {
      const inputOnlyAction = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input, bindArgs }) => {
          expect(bindArgs).toEqual([]);
          return `Input: ${input}`;
        })
        .build();

      const result = await inputOnlyAction("test input");
      expectSuccessResult(result, "Input: test input");
    });
  });

  describe("Error Conditions and Edge Cases", () => {
    it("should handle invalid single bind arg", async () => {
      const stringAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [message] = bindArgs;
          return `Message: ${message}`;
        })
        .build();

      // @ts-expect-error - Testing invalid bind args
      const result = await stringAction(123);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle invalid number bind arg", async () => {
      const numberAction = actioncraft()
        .schemas({
          bindSchemas: [numberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [value] = bindArgs;
          return value * 2;
        })
        .build();

      // @ts-expect-error - Testing invalid bind args
      const result = await numberAction("not-a-number");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle invalid object bind arg", async () => {
      const objectAction = actioncraft()
        .schemas({
          bindSchemas: [userSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [user] = bindArgs;
          return `User: ${user.name}`;
        })
        .build();

      const invalidUser = { name: "", email: "invalid", age: 15 };
      const result = await objectAction(invalidUser);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle invalid enum bind arg", async () => {
      const enumAction = actioncraft()
        .schemas({
          bindSchemas: [permissionLevelSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [permission] = bindArgs;
          return `Permission: ${permission}`;
        })
        .build();

      // @ts-expect-error - Testing invalid bind args
      const result = await enumAction("invalid-permission");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle invalid UUID bind arg", async () => {
      const uuidAction = actioncraft()
        .schemas({
          bindSchemas: [organizationIdSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [orgId] = bindArgs;
          return `Organization: ${orgId}`;
        })
        .build();

      const result = await uuidAction("not-a-uuid");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle partial validation failures in multiple bind args", async () => {
      const multiAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema, numberSchema, userSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str, num, user] = bindArgs;
          return `${str}-${num}-${user.name}`;
        })
        .build();

      // First arg invalid
      // @ts-expect-error - Testing invalid bind args
      const result1 = await multiAction(123, 42, commonTestData.validUser);
      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Second arg invalid
      const result2 = await multiAction(
        "test",
        // @ts-expect-error - Testing invalid bind args
        "not-number",
        commonTestData.validUser,
      );
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Third arg invalid
      const result3 = await multiAction("test", 42, {
        name: "",
        email: "invalid",
        age: 15,
      });
      expect(result3.success).toBe(false);
      if (!result3.success) {
        expect(result3.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle missing bind args", async () => {
      const multiAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema, numberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str, num] = bindArgs;
          return `${str}-${num}`;
        })
        .build();

      // @ts-expect-error - Testing missing bind args
      const result = await multiAction("test");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle null and undefined bind args", async () => {
      const nullableAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str] = bindArgs;
          return `Value: ${str}`;
        })
        .build();

      // @ts-expect-error - Testing null bind args
      const nullResult = await nullableAction(null);
      expect(nullResult.success).toBe(false);
      if (!nullResult.success) {
        expect(nullResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // @ts-expect-error - Testing undefined bind args
      const undefinedResult = await nullableAction(undefined);
      expect(undefinedResult.success).toBe(false);
      if (!undefinedResult.success) {
        expect(undefinedResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle empty array when array is required", async () => {
      const arrayAction = actioncraft()
        .schemas({
          bindSchemas: [arraySchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [data] = bindArgs;
          return data.items.length;
        })
        .build();

      const emptyArrayData = { items: [] };
      const result = await arrayAction(emptyArrayData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle schema that always fails", async () => {
      const alwaysFailAction = actioncraft()
        .schemas({
          bindSchemas: [alwaysFailSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [value] = bindArgs;
          return `Value: ${value}`;
        })
        .build();

      const result = await alwaysFailAction("any-value");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });
  });

  describe("Validation Error Formats", () => {
    it("should return flattened validation errors by default", async () => {
      const action = actioncraft()
        .schemas({
          bindSchemas: [strictSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [data] = bindArgs;
          return `Data: ${JSON.stringify(data)}`;
        })
        .build();

      const invalidData = {
        requiredField: "",
        strictNumber: -1,
        restrictedEnum: "invalid",
      };

      // @ts-expect-error
      const result = await action(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("issues" in result.error).toBe(true);
        if ("issues" in result.error) {
          expect(Array.isArray((result.error as any).issues)).toBe(true);
          expect((result.error as any).issues.length).toBeGreaterThan(0);
        }
      }
    });

    it("should return nested validation errors when configured", async () => {
      const action = actioncraft()
        .config({
          validationErrorFormat: "nested",
        })
        .schemas({
          bindSchemas: [strictSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [data] = bindArgs;
          return `Data: ${JSON.stringify(data)}`;
        })
        .build();

      const invalidData = {
        requiredField: "",
        strictNumber: -1,
        restrictedEnum: "invalid",
      };

      // @ts-expect-error
      const result = await action(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
        expect("formErrors" in result.error).toBe(true);
        expect("fieldErrors" in result.error).toBe(true);
      }
    });

    it("should distinguish bind args validation from input validation errors", async () => {
      const action = actioncraft()
        .schemas({
          inputSchema: userSchema,
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [prefix] = bindArgs;
          return `${prefix}: ${input.name}`;
        })
        .build();

      // Test bind args validation error
      // @ts-expect-error - Testing invalid bind args
      const bindArgsResult = await action(123, commonTestData.validUser);
      expect(bindArgsResult.success).toBe(false);
      if (!bindArgsResult.success) {
        expect(bindArgsResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Test input validation error
      const inputResult = await action("prefix", {
        name: "",
        email: "invalid",
        age: 15,
      });
      expect(inputResult.success).toBe(false);
      if (!inputResult.success) {
        expect(inputResult.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Async Bind Args Validation", () => {
    it("should handle async validation in bind args schemas", async () => {
      const asyncSchema = z.string().refine(async (val) => {
        // Simulate async validation (e.g., database check)
        await new Promise((resolve) => setTimeout(resolve, 10));
        return val !== "forbidden";
      }, "Value is forbidden");

      const asyncAction = actioncraft()
        .schemas({
          bindSchemas: [asyncSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [value] = bindArgs;
          return `Validated: ${value}`;
        })
        .build();

      // Valid async validation
      const validResult = await asyncAction("allowed");
      expectSuccessResult(validResult, "Validated: allowed");

      // Invalid async validation
      const invalidResult = await asyncAction("forbidden");
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle multiple async bind args validations", async () => {
      const asyncStringSchema = z.string().refine(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return val.length > 2;
      }, "String too short");

      const asyncNumberSchema = z.number().refine(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return val > 0;
      }, "Number must be positive");

      const multiAsyncAction = actioncraft()
        .schemas({
          bindSchemas: [asyncStringSchema, asyncNumberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str, num] = bindArgs;
          return `${str}: ${num}`;
        })
        .build();

      // Valid async validations
      const validResult = await multiAsyncAction("test", 42);
      expectSuccessResult(validResult, "test: 42");

      // Invalid first async validation
      const invalidFirstResult = await multiAsyncAction("ab", 42);
      expect(invalidFirstResult.success).toBe(false);
      if (!invalidFirstResult.success) {
        expect(invalidFirstResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }

      // Invalid second async validation
      const invalidSecondResult = await multiAsyncAction("test", -1);
      expect(invalidSecondResult.success).toBe(false);
      if (!invalidSecondResult.success) {
        expect(invalidSecondResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle async validation with complex objects", async () => {
      const asyncUserSchema = userSchema.refine(async (user) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        // Simulate checking if email is already taken
        return user.email !== "taken@example.com";
      }, "Email already exists");

      const asyncObjectAction = actioncraft()
        .schemas({
          bindSchemas: [asyncUserSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [user] = bindArgs;
          return `Created user: ${user.name}`;
        })
        .build();

      // Valid async object validation
      const validResult = await asyncObjectAction(commonTestData.validUser);
      expectSuccessResult(validResult, "Created user: John Doe");

      // Invalid async object validation
      const takenEmailUser = {
        ...commonTestData.validUser,
        email: "taken@example.com",
      };
      const invalidResult = await asyncObjectAction(takenEmailUser);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should handle async validation timeout scenarios", async () => {
      const slowAsyncSchema = z.string().refine(async (val) => {
        // Simulate a slow async operation
        await new Promise((resolve) => setTimeout(resolve, 100));
        return val === "valid";
      }, "Invalid value");

      const slowAction = actioncraft()
        .schemas({
          bindSchemas: [slowAsyncSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [value] = bindArgs;
          return `Processed: ${value}`;
        })
        .build();

      // This should still work, just take longer
      const result = await slowAction("valid");
      expectSuccessResult(result, "Processed: valid");
    });
  });

  describe("ActionBuilder API Bind Args Validation", () => {
    it("should validate bind args using actioncraft() API", async () => {
      const actionBuilderTest = actioncraft()
        .schemas({
          bindSchemas: [stringSchema, numberSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str, num] = bindArgs;
          return `${str}: ${num}`;
        })
        .build();

      const result = await actionBuilderTest("test", 42);
      expectSuccessResult(result, "test: 42");

      // @ts-expect-error - Testing invalid bind args
      const invalidResult = await actionBuilderTest(123, "invalid");
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("BIND_ARGS_VALIDATION");
      }
    });

    it("should validate complex bind args using actioncraft() API", async () => {
      const complexActionBuilder = actioncraft()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [userSchema, permissionLevelSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          const [user, permission] = bindArgs;
          return `${user.name} (${permission}): ${input}`;
        })
        .build();

      const result = await complexActionBuilder(
        commonTestData.validUser,
        "admin",
        "Hello World",
      );
      expectSuccessResult(result, "John Doe (admin): Hello World");
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("should handle zero bind args", async () => {
      const noBindArgsAction = actioncraft()
        .schemas({
          inputSchema: stringSchema,
        })
        .handler(async ({ input, bindArgs }) => {
          expect(bindArgs).toEqual([]);
          return `Input only: ${input}`;
        })
        .build();

      const result = await noBindArgsAction("test");
      expectSuccessResult(result, "Input only: test");
    });

    it("should handle very large bind arg values", async () => {
      const largeStringSchema = z.string().max(10000);
      const largeString = "x".repeat(5000);

      const largeValueAction = actioncraft()
        .schemas({
          bindSchemas: [largeStringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str] = bindArgs;
          return str.length;
        })
        .build();

      const result = await largeValueAction(largeString);
      expectSuccessResult(result, 5000);
    });

    it("should handle bind args with special characters", async () => {
      const specialCharsAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str] = bindArgs;
          return `Special: ${str}`;
        })
        .build();

      const specialString = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
      const result = await specialCharsAction(specialString);
      expectSuccessResult(result, `Special: ${specialString}`);
    });

    it("should handle bind args with unicode characters", async () => {
      const unicodeAction = actioncraft()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [str] = bindArgs;
          return `Unicode: ${str}`;
        })
        .build();

      const unicodeString = "🚀 Hello 世界 🌍 Здравствуй мир";
      const result = await unicodeAction(unicodeString);
      expectSuccessResult(result, `Unicode: ${unicodeString}`);
    });

    it("should handle deeply nested object bind args", async () => {
      const deepNestedAction = actioncraft()
        .schemas({
          bindSchemas: [nestedSchema] as const,
        })
        .handler(async ({ bindArgs }) => {
          const [data] = bindArgs;
          return {
            name: data.user.profile.name,
            theme: data.user.settings.theme,
            notifications: data.user.settings.notifications,
            metadataKeys: Object.keys(data.metadata),
          };
        })
        .build();

      const result = await deepNestedAction(validNestedData);
      expectSuccessResult(result, {
        name: "John",
        theme: "dark",
        notifications: true,
        metadataKeys: ["source", "version"],
      });
    });
  });
});
