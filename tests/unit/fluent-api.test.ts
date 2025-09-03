import { craft } from "../../src/index";
import { stringSchema, numberSchema, userSchema } from "../fixtures/schemas";
import { describe, expect, it } from "../setup";

describe("Fluent API", () => {
  describe("craft() function", () => {
    it("should create a crafted action", () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );
      expect(action).toBeDefined();
      expect(typeof action).toBe("function");
    });

    it("should accept configuration", () => {
      const action = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
            resultFormat: "functional",
          })
          .handler(async () => "test"),
      );
      expect(action).toBeDefined();
      expect(typeof action).toBe("function");
    });

    it("should accept useActionState configuration", () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => "test"),
      );
      expect(action).toBeDefined();
      expect(typeof action).toBe("function");
    });
  });

  describe("Method chaining", () => {
    it("should allow chaining schemas -> errors -> handler", () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            validationError: (message: string) =>
              ({
                type: "VALIDATION_ERROR",
                message,
              }) as const,
          })
          .handler(async ({ input }) => {
            return (input as string).toUpperCase();
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should allow chaining in different orders", () => {
      const action1 = craft((action) =>
        action
          .errors({
            customError: () => ({ type: "CUSTOM" }) as const,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      const action2 = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      expect(typeof action1).toBe("function");
      expect(typeof action2).toBe("function");
    });

    it("should allow callbacks after handler", () => {
      const onSuccessMock = () => {};
      const onErrorMock = () => {};

      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input)
          .callbacks({
            onSuccess: onSuccessMock,
            onError: onErrorMock,
          }),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Configuration options", () => {
    it("should handle validationErrorFormat configuration", () => {
      const flattenedAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      const nestedAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

      expect(typeof flattenedAction).toBe("function");
      expect(typeof nestedAction).toBe("function");
    });

    it("should handle resultFormat configuration", () => {
      const functionalAction = craft((action) =>
        action
          .config({
            resultFormat: "functional",
          })
          .handler(async () => "test"),
      );

      const apiAction = craft((action) =>
        action
          .config({
            resultFormat: "api",
          })
          .handler(async () => "test"),
      );

      expect(typeof functionalAction).toBe("function");
      expect(typeof apiAction).toBe("function");
    });

    it("should handle custom error handler", () => {
      const customErrorHandler = (error: unknown) =>
        ({
          type: "CUSTOM_UNHANDLED",
          originalError: error,
        }) as const;

      const action = craft((action) =>
        action
          .config({
            handleThrownError: customErrorHandler,
          })
          .handler(async () => "test"),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Schema types", () => {
    it("should handle multiple schemas", () => {
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: stringSchema,
            bindSchemas: [numberSchema, userSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [num, user] = bindArgs;
            return `${input as string}-${num as number}-${
              (user as { name: string }).name
            }`;
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should work without input schema", () => {
      const action = craft((action) => action.handler(async () => "no input"));

      expect(typeof action).toBe("function");
    });
  });

  describe("Error handling", () => {
    it("should throw error if craft() is called without handler", () => {
      expect(() => {
        craft((action) => action.schemas({ inputSchema: stringSchema }));
      }).toThrow("A handler implementation is required");
    });

    it("should accept multiple error definitions", () => {
      const action = craft((action) =>
        action
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
          .handler(async ({ errors }) => {
            // All error functions should be available
            expect(typeof errors.notFound).toBe("function");
            expect(typeof errors.unauthorized).toBe("function");
            expect(typeof errors.validationFailed).toBe("function");
            return "success";
          }),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Advanced chaining scenarios", () => {
    it("should reset callbacks when schemas() is called after handler", () => {
      // This tests the warning behavior where schemas() resets callbacks
      const action = craft((action) =>
        action
          .handler(async () => "test")
          .callbacks({
            onSuccess: () => {},
          })
          .schemas({ inputSchema: stringSchema }) // This should reset callbacks
          .handler(async ({ input }) => input),
      );

      expect(typeof action).toBe("function");
    });

    it("should reset callbacks when errors() is called after handler", () => {
      // This tests the warning behavior where errors() resets callbacks
      const action = craft((action) =>
        action
          .handler(async () => "test")
          .callbacks({
            onSuccess: () => {},
          })
          .errors({
            customError: () => ({ type: "CUSTOM" }) as const,
          }) // This should reset callbacks
          .handler(async () => "test"),
      );

      expect(typeof action).toBe("function");
    });

    it("should reset callbacks when handler() is called again", () => {
      // This tests that handler() resets callbacks
      const action = craft(
        (action) =>
          action
            .handler(async () => "first")
            .callbacks({
              onSuccess: () => {},
            })
            .handler(async () => "second"), // This should reset callbacks
      );

      expect(typeof action).toBe("function");
    });

    it("should allow multiple schemas() calls", () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .schemas({ inputSchema: numberSchema }) // Override previous schemas
          .handler(async ({ input }) => input),
      );

      expect(typeof action).toBe("function");
    });

    it("should allow multiple errors() calls", () => {
      const action = craft((action) =>
        action
          .errors({
            firstError: () => ({ type: "FIRST" }) as const,
          })
          .errors({
            secondError: () => ({ type: "SECOND" }) as const,
          }) // Override previous errors
          .handler(async ({ errors }) => {
            expect(typeof errors.secondError).toBe("function");
            return "test";
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should use schemas from the last schemas() call for validation", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema }) // first schema (string)
          .schemas({ inputSchema: numberSchema }) // override with number
          .handler(async ({ input }) => {
            return (input as number) * 2;
          }),
      );

      // Valid number should succeed
      const validResult = await action(21);
      expect(validResult).toEqual({
        success: true,
        data: 42,
        __ac_id: expect.any(String),
      });

      // Invalid string should now fail validation (because final schema expects number)
      // @ts-expect-error
      const invalidResult = await action("invalid");
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should use errors from the last errors() call", async () => {
      const action = craft((action) =>
        action
          .errors({ first: () => ({ type: "FIRST" }) as const })
          .errors({ second: () => ({ type: "SECOND" }) as const }) // override
          .handler(async ({ errors }) => {
            // Only 'second' should be available now
            return errors.second();
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("SECOND");
      }
    });
  });

  describe("Configuration edge cases", () => {
    it("should handle empty configuration object", () => {
      const action = craft((action) =>
        action.config({}).handler(async () => "test"),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle useActionState with explicit resultFormat", () => {
      // This should work since useActionState forces api format
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            resultFormat: "api",
          })
          .handler(async () => "test"),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle all validation format combinations", () => {
      const nestedAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "nested",
            resultFormat: "functional",
          })
          .handler(async () => "test"),
      );

      const flattenedAction = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
            resultFormat: "api",
          })
          .handler(async () => "test"),
      );

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

      const action = craft((action) =>
        action
          .config({
            handleThrownError: customHandler,
            validationErrorFormat: "flattened",
          })
          .handler(async () => "test"),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Schema edge cases", () => {
    it("should handle empty schemas object", () => {
      const action = craft((action) =>
        action
          .schemas({}) // Empty schemas
          .handler(async () => "no schemas"),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle only outputSchema", () => {
      const action = craft((action) =>
        action
          .schemas({
            outputSchema: stringSchema,
          })
          .handler(async () => "output only"),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle only bindSchemas", () => {
      const action = craft((action) =>
        action
          .schemas({
            bindSchemas: [numberSchema] as const,
          })
          .handler(async ({ bindArgs }) => {
            return `Bind arg: ${bindArgs[0] as number}`;
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle empty bindSchemas array", () => {
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            expect(bindArgs).toEqual([]);
            return input;
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle single bindSchema", () => {
      const action = craft((action) =>
        action
          .schemas({
            bindSchemas: [stringSchema] as const,
          })
          .handler(async ({ bindArgs }) => {
            const [singleArg] = bindArgs;
            return `Single: ${singleArg as string}`;
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle all schema types together", () => {
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: stringSchema,
            bindSchemas: [numberSchema, userSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => {
            const [num, user] = bindArgs;
            return `${input as string}-${num as number}-${
              (user as { name: string }).name
            }`;
          }),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Error definition edge cases", () => {
    it("should handle empty errors object", () => {
      const action = craft((action) =>
        action
          .errors({}) // Empty errors
          .handler(async ({ errors }) => {
            expect(Object.keys(errors)).toHaveLength(0);
            return "no errors";
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle single error definition", () => {
      const action = craft((action) =>
        action
          .errors({
            singleError: () => ({ type: "SINGLE" }) as const,
          })
          .handler(async ({ errors }) => {
            expect(typeof errors.singleError).toBe("function");
            return "single error";
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle error with complex parameters", () => {
      const action = craft((action) =>
        action
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
          .handler(async ({ errors }) => {
            expect(typeof errors.complexError).toBe("function");
            return "complex error";
          }),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Callback edge cases", () => {
    it("should handle partial callback definitions", () => {
      const onSuccessOnly = craft((action) =>
        action
          .handler(async () => "test")
          .callbacks({
            onSuccess: () => {},
          }),
      );

      const onErrorOnly = craft((action) =>
        action
          .handler(async () => "test")
          .callbacks({
            onError: () => {},
          }),
      );

      const onSettledOnly = craft((action) =>
        action
          .handler(async () => "test")
          .callbacks({
            onSettled: () => {},
          }),
      );

      expect(typeof onSuccessOnly).toBe("function");
      expect(typeof onErrorOnly).toBe("function");
      expect(typeof onSettledOnly).toBe("function");
    });

    it("should handle async callbacks", () => {
      const action = craft((action) =>
        action
          .handler(async () => "test")
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
          }),
      );

      expect(typeof action).toBe("function");
    });

    it("should handle callbacks with complex logic", () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input)
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
          }),
      );

      expect(typeof action).toBe("function");
    });
  });

  describe("Error scenarios", () => {
    it("should throw error if craft() is called without handler on empty builder", () => {
      expect(() => {
        craft((action) => action);
      }).toThrow("A handler implementation is required");
    });

    it("should throw error if craft() is called after schemas but no handler", () => {
      expect(() => {
        craft((action) => action.schemas({ inputSchema: stringSchema }));
      }).toThrow("A handler implementation is required");
    });

    it("should throw error if craft() is called after errors but no handler", () => {
      expect(() => {
        craft((action) =>
          action.errors({
            testError: () => ({ type: "TEST" }) as const,
          }),
        );
      }).toThrow("A handler implementation is required");
    });

    it("should throw error if craft() is called after callbacks reset by schemas", () => {
      expect(() => {
        craft(
          (action) =>
            action
              .handler(async () => "test")
              .callbacks({ onSuccess: () => {} })
              .schemas({ inputSchema: stringSchema }), // This resets handler
        ); // No handler defined after schemas
      }).toThrow("A handler implementation is required");
    });
  });
});
