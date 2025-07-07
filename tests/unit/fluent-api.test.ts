import { create } from "../../src/actioncraft";
import { stringSchema, numberSchema, userSchema } from "../fixtures/schemas";
import { describe, expect, it } from "../setup";

describe("Fluent API", () => {
  describe("create() function", () => {
    it("should create an ActionCrafter instance", () => {
      const crafter = create();
      expect(crafter).toBeDefined();
      expect(typeof crafter.schemas).toBe("function");
      expect(typeof crafter.errors).toBe("function");
      expect(typeof crafter.action).toBe("function");
      expect(typeof crafter.craft).toBe("function");
    });

    it("should accept configuration", () => {
      const crafter = create({
        validationErrorFormat: "flattened",
        resultFormat: "functional",
      });
      expect(crafter).toBeDefined();
    });

    it("should accept useActionState configuration", () => {
      const crafter = create({
        useActionState: true,
      });
      expect(crafter).toBeDefined();
    });
  });

  describe("Method chaining", () => {
    it("should allow chaining schemas -> errors -> action -> craft", () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .errors({
          validationError: (message: string) =>
            ({
              type: "VALIDATION_ERROR",
              message,
            }) as const,
        })
        .action(async ({ input }) => {
          return (input as string).toUpperCase();
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should allow chaining in different orders", () => {
      const action1 = create()
        .errors({
          customError: () => ({ type: "CUSTOM" }) as const,
        })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      const action2 = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      expect(typeof action1).toBe("function");
      expect(typeof action2).toBe("function");
    });

    it("should allow callbacks after action", () => {
      const onSuccessMock = () => {};
      const onErrorMock = () => {};

      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .callbacks({
          onSuccess: onSuccessMock,
          onError: onErrorMock,
        })
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Configuration options", () => {
    it("should handle validationErrorFormat configuration", () => {
      const flattenedAction = create({
        validationErrorFormat: "flattened",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      const nestedAction = create({
        validationErrorFormat: "nested",
      })
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .craft();

      expect(typeof flattenedAction).toBe("function");
      expect(typeof nestedAction).toBe("function");
    });

    it("should handle resultFormat configuration", () => {
      const functionalAction = create({
        resultFormat: "functional",
      })
        .action(async () => "test")
        .craft();

      const apiAction = create({
        resultFormat: "api",
      })
        .action(async () => "test")
        .craft();

      expect(typeof functionalAction).toBe("function");
      expect(typeof apiAction).toBe("function");
    });

    it("should handle custom error handler", () => {
      const customErrorHandler = (error: unknown) =>
        ({
          type: "CUSTOM_UNHANDLED",
          originalError: error,
        }) as const;

      const action = create({
        handleThrownError: customErrorHandler,
      })
        .action(async () => "test")
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Schema types", () => {
    it("should handle multiple schemas", () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
          bindSchemas: [numberSchema, userSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [num, user] = bindArgs;
          return `${input as string}-${num as number}-${
            (user as { name: string }).name
          }`;
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should work without input schema", () => {
      const action = create()
        .action(async () => "no input")
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Error handling", () => {
    it("should throw error if craft() is called without action", () => {
      expect(() => {
        create().schemas({ inputSchema: stringSchema }).craft();
      }).toThrow("Action implementation is not defined");
    });

    it("should accept multiple error definitions", () => {
      const action = create()
        .errors({
          notFound: (id: string) =>
            ({
              type: "NOT_FOUND",
              id,
            }) as const,
          unauthorized: () =>
            ({
              type: "UNAUTHORIZED",
            }) as const,
          validationFailed: (field: string, value: unknown) =>
            ({
              type: "VALIDATION_FAILED",
              field,
              value,
            }) as const,
        })
        .action(async ({ errors }) => {
          // All error functions should be available
          expect(typeof errors.notFound).toBe("function");
          expect(typeof errors.unauthorized).toBe("function");
          expect(typeof errors.validationFailed).toBe("function");
          return "success";
        })
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Advanced chaining scenarios", () => {
    it("should reset callbacks when schemas() is called after action", () => {
      // This tests the warning behavior where schemas() resets callbacks
      const action = create()
        .action(async () => "test")
        .callbacks({
          onSuccess: () => {},
        })
        .schemas({ inputSchema: stringSchema }) // This should reset callbacks
        .action(async ({ input }) => input)
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should reset callbacks when errors() is called after action", () => {
      // This tests the warning behavior where errors() resets callbacks
      const action = create()
        .action(async () => "test")
        .callbacks({
          onSuccess: () => {},
        })
        .errors({
          customError: () => ({ type: "CUSTOM" }) as const,
        }) // This should reset callbacks
        .action(async () => "test")
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should reset callbacks when action() is called again", () => {
      // This tests that action() resets callbacks
      const action = create()
        .action(async () => "first")
        .callbacks({
          onSuccess: () => {},
        })
        .action(async () => "second") // This should reset callbacks
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should allow multiple schemas() calls", () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .schemas({ inputSchema: numberSchema }) // Override previous schemas
        .action(async ({ input }) => input)
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should allow multiple errors() calls", () => {
      const action = create()
        .errors({
          firstError: () => ({ type: "FIRST" }) as const,
        })
        .errors({
          secondError: () => ({ type: "SECOND" }) as const,
        }) // Override previous errors
        .action(async ({ errors }) => {
          expect(typeof errors.secondError).toBe("function");
          return "test";
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should use schemas from the last schemas() call for validation", async () => {
      const action = create()
        .schemas({ inputSchema: stringSchema }) // first schema (string)
        .schemas({ inputSchema: numberSchema }) // override with number
        .action(async ({ input }) => {
          return (input as number) * 2;
        })
        .craft();

      // Valid number should succeed
      const validResult = await action(21);
      expect(validResult).toEqual({ success: true, data: 42 });

      // Invalid string should now fail validation (because final schema expects number)
      // @ts-expect-error – intentionally passing wrong type
      const invalidResult = await action("invalid");
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should use errors from the last errors() call", async () => {
      const action = create()
        .errors({ first: () => ({ type: "FIRST" }) as const })
        .errors({ second: () => ({ type: "SECOND" }) as const }) // override
        .action(async ({ errors }) => {
          // Only 'second' should be available now
          return errors.second();
        })
        .craft();

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("SECOND");
      }
    });
  });

  describe("Configuration edge cases", () => {
    it("should handle empty configuration object", () => {
      const action = create({})
        .action(async () => "test")
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle useActionState with explicit resultFormat", () => {
      // This should work since useActionState forces api format
      const action = create({
        useActionState: true,
        resultFormat: "api",
      })
        .action(async () => "test")
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle all validation format combinations", () => {
      const nestedAction = create({
        validationErrorFormat: "nested",
        resultFormat: "functional",
      })
        .action(async () => "test")
        .craft();

      const flattenedAction = create({
        validationErrorFormat: "flattened",
        resultFormat: "api",
      })
        .action(async () => "test")
        .craft();

      expect(typeof nestedAction).toBe("function");
      expect(typeof flattenedAction).toBe("function");
    });

    it("should handle complex custom error handler", () => {
      const customHandler = (error: unknown) => {
        if (error instanceof Error) {
          return {
            type: "TYPED_ERROR",
            message: error.message,
            stack: error.stack,
          } as const;
        }
        return {
          type: "UNKNOWN_ERROR",
          error: String(error),
        } as const;
      };

      const action = create({
        handleThrownError: customHandler,
        validationErrorFormat: "flattened",
      })
        .action(async () => "test")
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Schema edge cases", () => {
    it("should handle empty schemas object", () => {
      const action = create()
        .schemas({}) // Empty schemas
        .action(async () => "no schemas")
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle only outputSchema", () => {
      const action = create()
        .schemas({
          outputSchema: stringSchema,
        })
        .action(async () => "output only")
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle only bindSchemas", () => {
      const action = create()
        .schemas({
          bindSchemas: [numberSchema] as const,
        })
        .action(async ({ bindArgs }) => {
          return `Bind arg: ${bindArgs[0] as number}`;
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle empty bindSchemas array", () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          bindSchemas: [] as const,
        })
        .action(async ({ input, bindArgs }) => {
          expect(bindArgs).toEqual([]);
          return input;
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle single bindSchema", () => {
      const action = create()
        .schemas({
          bindSchemas: [stringSchema] as const,
        })
        .action(async ({ bindArgs }) => {
          const [singleArg] = bindArgs;
          return `Single: ${singleArg as string}`;
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle all schema types together", () => {
      const action = create()
        .schemas({
          inputSchema: stringSchema,
          outputSchema: stringSchema,
          bindSchemas: [numberSchema, userSchema] as const,
        })
        .action(async ({ input, bindArgs }) => {
          const [num, user] = bindArgs;
          return `${input as string}-${num as number}-${
            (user as { name: string }).name
          }`;
        })
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Error definition edge cases", () => {
    it("should handle empty errors object", () => {
      const action = create()
        .errors({}) // Empty errors
        .action(async ({ errors }) => {
          expect(Object.keys(errors)).toHaveLength(0);
          return "no errors";
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle single error definition", () => {
      const action = create()
        .errors({
          singleError: () => ({ type: "SINGLE" }) as const,
        })
        .action(async ({ errors }) => {
          expect(typeof errors.singleError).toBe("function");
          return "single error";
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle error with complex parameters", () => {
      const action = create()
        .errors({
          complexError: (
            id: string,
            details: { code: number; reason: string },
          ) => ({
            type: "COMPLEX_ERROR",
            id,
            code: details.code,
            reason: details.reason,
          }),
        })
        .action(async ({ errors }) => {
          expect(typeof errors.complexError).toBe("function");
          return "complex error";
        })
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Callback edge cases", () => {
    it("should handle partial callback definitions", () => {
      const onSuccessOnly = create()
        .action(async () => "test")
        .callbacks({
          onSuccess: () => {},
        })
        .craft();

      const onErrorOnly = create()
        .action(async () => "test")
        .callbacks({
          onError: () => {},
        })
        .craft();

      const onSettledOnly = create()
        .action(async () => "test")
        .callbacks({
          onSettled: () => {},
        })
        .craft();

      expect(typeof onSuccessOnly).toBe("function");
      expect(typeof onErrorOnly).toBe("function");
      expect(typeof onSettledOnly).toBe("function");
    });

    it("should handle async callbacks", () => {
      const action = create()
        .action(async () => "test")
        .callbacks({
          onSuccess: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
          },
          onError: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
          },
          onSettled: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
          },
        })
        .craft();

      expect(typeof action).toBe("function");
    });

    it("should handle callbacks with complex logic", () => {
      const action = create()
        .schemas({ inputSchema: stringSchema })
        .action(async ({ input }) => input)
        .callbacks({
          onSuccess: ({ data, metadata }) => {
            expect(data).toBeDefined();
            expect(metadata.rawInput).toBeDefined();
            expect(metadata.validatedInput).toBeDefined();
          },
          onError: ({ error, metadata }) => {
            expect(error).toBeDefined();
            expect(metadata.rawInput).toBeDefined();
          },
          onSettled: ({ result, metadata }) => {
            expect(result).toBeDefined();
            expect(metadata).toBeDefined();
          },
        })
        .craft();

      expect(typeof action).toBe("function");
    });
  });

  describe("Error scenarios", () => {
    it("should throw error if craft() is called without action on empty crafter", () => {
      expect(() => {
        create().craft();
      }).toThrow("Action implementation is not defined");
    });

    it("should throw error if craft() is called after schemas but no action", () => {
      expect(() => {
        create().schemas({ inputSchema: stringSchema }).craft();
      }).toThrow("Action implementation is not defined");
    });

    it("should throw error if craft() is called after errors but no action", () => {
      expect(() => {
        create()
          .errors({
            testError: () => ({ type: "TEST" }) as const,
          })
          .craft();
      }).toThrow("Action implementation is not defined");
    });

    it("should throw error if craft() is called after callbacks reset by schemas", () => {
      expect(() => {
        create()
          .action(async () => "test")
          .callbacks({ onSuccess: () => {} })
          .schemas({ inputSchema: stringSchema }) // This resets action
          .craft(); // No action defined after schemas
      }).toThrow("Action implementation is not defined");
    });
  });
});
