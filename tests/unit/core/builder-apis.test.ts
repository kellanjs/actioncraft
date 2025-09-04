import { craft, action } from "../../../src/index";
import {
  expectValidAction,
  expectSuccessResult,
  expectErrorResult,
  commonErrorFactories,
  commonTestData,
} from "../../__fixtures__/helpers";
import {
  stringSchema,
  numberSchema,
  userSchema,
} from "../../__fixtures__/schemas";
import { describe, expect, it } from "../../setup";

// File-specific test utilities (not shared across other test files)
const testSchemas = {
  string: stringSchema,
  number: numberSchema,
  user: userSchema,
};

const testConfigs = {
  flattened: { validationErrorFormat: "flattened" as const },
  nested: { validationErrorFormat: "nested" as const },
  functional: { resultFormat: "functional" as const },
  api: { resultFormat: "api" as const },
  useActionState: { useActionState: true },
  flattenedFunctional: {
    validationErrorFormat: "flattened" as const,
    resultFormat: "functional" as const,
  },
  nestedApi: {
    validationErrorFormat: "nested" as const,
    resultFormat: "api" as const,
  },
  useActionStateApi: {
    useActionState: true,
    resultFormat: "api" as const,
  },
  customErrorHandler: {
    handleThrownError: (error: unknown) => ({
      type: "CUSTOM_UNHANDLED" as const,
      originalError: error,
    }),
  },
  complexCustomHandler: {
    handleThrownError: (error: unknown) => {
      if (error instanceof Error) {
        return {
          type: "TYPED_ERROR" as const,
          message: error.message,
          stack: error.stack,
        };
      }
      return {
        type: "UNKNOWN_ERROR" as const,
        error: String(error),
      };
    },
    validationErrorFormat: "flattened" as const,
  },
};

const mockCallbacks = {
  onSuccess: () => {},
  onError: () => {},
  onSettled: () => {},
  async: {
    onSuccess: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    },
    onError: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    },
    onSettled: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    },
  },
  complex: {
    onSuccess: ({ data, metadata }: any) => {
      expect(data).toBeDefined();
      expect(metadata.rawInput).toBeDefined();
      expect(metadata.validatedInput).toBeDefined();
    },
    onError: ({ error, metadata }: any) => {
      expect(error).toBeDefined();
      expect(metadata.rawInput).toBeDefined();
    },
    onSettled: ({ result, metadata }: any) => {
      expect(result).toBeDefined();
      expect(metadata).toBeDefined();
    },
  },
};

const testHandlers = {
  identity: async ({ input }: any) => input,
  uppercase: async ({ input }: any) => (input as string).toUpperCase(),
  noInput: async () => "no input",
  multiply: async ({ input }: any) => (input as number) * 2,
  withBindArgs: async ({ input, bindArgs }: any) => {
    const [num, user] = bindArgs;
    return `${input as string}-${num as number}-${(user as { name: string }).name}`;
  },
  withErrorCheck: async ({ input, errors }: any) => {
    if (input === "error") {
      return errors.businessError("Test error");
    }
    return (input as string).toUpperCase();
  },
  errorThrowing: async ({ errors }: any) => {
    return errors.secondError();
  },
  bindArgProcessor: async ({ bindArgs }: any) => {
    const [singleArg] = bindArgs;
    return `Single: ${singleArg as string}`;
  },
  bindArgChecker: async ({ bindArgs }: any) => {
    return `Bind arg: ${bindArgs[0] as number}`;
  },
  bindArgValidator: async ({ input, bindArgs }: any) => {
    expect(bindArgs).toEqual([]);
    return input;
  },
  errorValidator: async ({ errors }: any) => {
    expect(Object.keys(errors)).toHaveLength(0);
    return "no errors";
  },
  singleErrorValidator: async ({ errors }: any) => {
    expect(typeof errors.singleError).toBe("function");
    return "single error";
  },
  complexErrorValidator: async ({ errors }: any) => {
    expect(typeof errors.complexError).toBe("function");
    return "complex error";
  },
  multiErrorValidator: async ({ errors }: any) => {
    expect(typeof errors.notFound).toBe("function");
    expect(typeof errors.unauthorized).toBe("function");
    expect(typeof errors.validationFailed).toBe("function");
    return "success";
  },
  secondErrorValidator: async ({ errors }: any) => {
    expect(typeof errors.secondError).toBe("function");
    return "test";
  },
};

const commonErrors = {
  validationError: (message: string) => ({
    type: "VALIDATION_ERROR" as const,
    message,
  }),
  notFound: commonErrorFactories.notFound,
  unauthorized: commonErrorFactories.unauthorized,
  validationFailed: (field: string, value: unknown) => ({
    type: "VALIDATION_FAILED" as const,
    field,
    value,
  }),
  customError: () => ({ type: "CUSTOM" as const }),
  businessError: (msg: string) => ({ type: "BUSINESS_ERROR" as const, msg }),
  firstError: () => ({ type: "FIRST" as const }),
  secondError: () => ({ type: "SECOND" as const }),
  singleError: () => ({ type: "SINGLE" as const }),
  complexError: (id: string, details: { code: number; reason: string }) => ({
    type: "COMPLEX_ERROR" as const,
    id,
    code: details.code,
    reason: details.reason,
  }),
  testError: () => ({ type: "TEST" as const }),
};

/**
 * Consolidated test suite for both craft() and action() APIs
 * Tests both APIs in a loop to eliminate duplication
 */

// Define the API configurations to test
const apiConfigs = [
  {
    name: "Craft",
    createAction: (builderFn: any) => craft(builderFn),
    isActionBuilder: false,
  },
  {
    name: "ActionBuilder",
    createAction: (builderFn: any) => {
      const builder = action();
      const configuredBuilder = builderFn(builder);
      return configuredBuilder.craft();
    },
    isActionBuilder: true,
  },
];

// Run the test suite for each API
apiConfigs.forEach(({ name, createAction, isActionBuilder }) => {
  describe(`${name} API`, () => {
    describe(`${name.toLowerCase()}() function`, () => {
      it(`should create a ${isActionBuilder ? "builder instance" : "crafted action"}`, () => {
        if (isActionBuilder) {
          // For ActionBuilder, we test that we can create a valid action
          const action = createAction((builder: any) =>
            builder.handler(async () => "test"),
          );
          expectValidAction(action);
        } else {
          const action = createAction((action: any) =>
            action
              .schemas({ inputSchema: testSchemas.string })
              .handler(testHandlers.identity),
          );
          expectValidAction(action);
        }
      });

      if (isActionBuilder) {
        it("should create a crafted action using fluent API", () => {
          const craftedAction = createAction((builder: any) =>
            builder
              .schemas({ inputSchema: testSchemas.string })
              .handler(testHandlers.identity),
          );
          expectValidAction(craftedAction);
        });
      }

      it("should accept configuration", () => {
        const action = createAction((builder: any) =>
          builder
            .config(testConfigs.flattenedFunctional)
            .handler(async () => "test"),
        );
        expectValidAction(action);
      });

      it("should accept useActionState configuration", () => {
        const action = createAction((builder: any) =>
          builder
            .config(testConfigs.useActionState)
            .handler(async () => "test"),
        );
        expectValidAction(action);
      });
    });

    describe("Method chaining", () => {
      it("should allow chaining schemas -> errors -> handler", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ inputSchema: testSchemas.string })
            .errors({ validationError: commonErrors.validationError })
            .handler(testHandlers.uppercase),
        );
        expectValidAction(action);
      });

      it("should allow chaining in different orders", () => {
        const action1 = createAction((builder: any) =>
          builder
            .errors({ customError: commonErrors.customError })
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity),
        );

        const action2 = createAction((builder: any) =>
          builder
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity),
        );

        expectValidAction(action1);
        expectValidAction(action2);
      });

      it("should allow callbacks after handler", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity)
            .callbacks({
              onSuccess: mockCallbacks.onSuccess,
              onError: mockCallbacks.onError,
            }),
        );
        expectValidAction(action);
      });

      if (isActionBuilder) {
        it("should allow config -> schemas -> errors -> handler -> callbacks -> craft", () => {
          const action = createAction((builder: any) =>
            builder
              .config(testConfigs.nestedApi)
              .schemas({
                inputSchema: testSchemas.string,
                outputSchema: testSchemas.string,
              })
              .errors({ businessError: commonErrors.businessError })
              .handler(testHandlers.withErrorCheck)
              .callbacks({
                onSuccess: mockCallbacks.onSuccess,
                onError: mockCallbacks.onError,
                onSettled: mockCallbacks.onSettled,
              }),
          );
          expectValidAction(action);
        });
      }
    });

    describe("Configuration options", () => {
      it("should handle validationErrorFormat configuration", () => {
        const flattenedAction = createAction((builder: any) =>
          builder
            .config(testConfigs.flattened)
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity),
        );

        const nestedAction = createAction((builder: any) =>
          builder
            .config(testConfigs.nested)
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity),
        );

        expectValidAction(flattenedAction);
        expectValidAction(nestedAction);
      });

      it("should handle resultFormat configuration", () => {
        const functionalAction = createAction((builder: any) =>
          builder.config(testConfigs.functional).handler(async () => "test"),
        );

        const apiAction = createAction((builder: any) =>
          builder.config(testConfigs.api).handler(async () => "test"),
        );

        expectValidAction(functionalAction);
        expectValidAction(apiAction);
      });

      it("should handle custom error handler", () => {
        const action = createAction((builder: any) =>
          builder
            .config(testConfigs.customErrorHandler)
            .handler(async () => "test"),
        );
        expectValidAction(action);
      });
    });

    describe("Schema types", () => {
      it("should handle multiple schemas", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({
              inputSchema: testSchemas.string,
              outputSchema: testSchemas.string,
              bindSchemas: [testSchemas.number, testSchemas.user] as const,
            })
            .handler(testHandlers.withBindArgs),
        );
        expectValidAction(action);
      });

      it("should work without input schema", () => {
        const action = createAction((builder: any) =>
          builder.handler(testHandlers.noInput),
        );
        expectValidAction(action);
      });
    });

    describe("Error handling", () => {
      it("should throw error if craft() is called without handler", () => {
        expect(() => {
          createAction((builder: any) =>
            builder.schemas({ inputSchema: testSchemas.string }),
          );
        }).toThrow("A handler implementation is required");
      });

      it("should accept multiple error definitions", () => {
        const action = createAction((builder: any) =>
          builder
            .errors({
              notFound: commonErrors.notFound,
              unauthorized: commonErrors.unauthorized,
              validationFailed: commonErrors.validationFailed,
            })
            .handler(testHandlers.multiErrorValidator),
        );
        expectValidAction(action);
      });
    });

    describe("Advanced chaining scenarios", () => {
      it("should reset callbacks when schemas() is called after handler", () => {
        const action = createAction((builder: any) =>
          builder
            .handler(async () => "test")
            .callbacks({ onSuccess: mockCallbacks.onSuccess })
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity),
        );
        expectValidAction(action);
      });

      it("should reset callbacks when errors() is called after handler", () => {
        const action = createAction((builder: any) =>
          builder
            .handler(async () => "test")
            .callbacks({ onSuccess: mockCallbacks.onSuccess })
            .errors({ customError: commonErrors.customError })
            .handler(async () => "test"),
        );
        expectValidAction(action);
      });

      it("should reset callbacks when handler() is called again", () => {
        const action = createAction((builder: any) =>
          builder
            .handler(async () => "first")
            .callbacks({ onSuccess: mockCallbacks.onSuccess })
            .handler(async () => "second"),
        );
        expectValidAction(action);
      });

      it("should allow multiple schemas() calls", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ inputSchema: testSchemas.string })
            .schemas({ inputSchema: testSchemas.number })
            .handler(testHandlers.identity),
        );
        expectValidAction(action);
      });

      it("should allow multiple errors() calls", () => {
        const action = createAction((builder: any) =>
          builder
            .errors({ firstError: commonErrors.firstError })
            .errors({ secondError: commonErrors.secondError })
            .handler(testHandlers.secondErrorValidator),
        );
        expectValidAction(action);
      });

      it("should use schemas from the last schemas() call for validation", async () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ inputSchema: testSchemas.string })
            .schemas({ inputSchema: testSchemas.number })
            .handler(testHandlers.multiply),
        );

        const validResult = await action(commonTestData.validNumber);
        expectSuccessResult(validResult, commonTestData.expectedDoubled);

        const invalidResult = await action(commonTestData.invalidString);
        expect(invalidResult.success).toBe(false);
        if (!invalidResult.success) {
          expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
        }
      });

      it("should use errors from the last errors() call", async () => {
        const action = createAction((builder: any) =>
          builder
            .errors({ first: commonErrors.firstError })
            .errors({ second: commonErrors.secondError })
            .handler(async ({ errors }: any) => {
              // The error key is 'second', not 'secondError'
              return errors.second();
            }),
        );

        const result = await action();
        expectErrorResult(result, { type: "SECOND" });
      });
    });

    describe("Configuration edge cases", () => {
      it("should handle empty configuration object", () => {
        const action = createAction((builder: any) =>
          builder.config({}).handler(async () => "test"),
        );
        expectValidAction(action);
      });

      it("should handle useActionState with explicit resultFormat", () => {
        const action = createAction((builder: any) =>
          builder
            .config(testConfigs.useActionStateApi)
            .handler(async () => "test"),
        );
        expectValidAction(action);
      });

      it("should handle all validation format combinations", () => {
        const nestedAction = createAction((builder: any) =>
          builder.config(testConfigs.nestedApi).handler(async () => "test"),
        );

        const flattenedAction = createAction((builder: any) =>
          builder
            .config(testConfigs.flattenedFunctional)
            .handler(async () => "test"),
        );

        expectValidAction(nestedAction);
        expectValidAction(flattenedAction);
      });

      it("should handle complex custom error handler", () => {
        const action = createAction((builder: any) =>
          builder
            .config(testConfigs.complexCustomHandler)
            .handler(async () => "test"),
        );
        expectValidAction(action);
      });
    });

    describe("Schema edge cases", () => {
      it("should handle empty schemas object", () => {
        const action = createAction((builder: any) =>
          builder.schemas({}).handler(async () => "no schemas"),
        );
        expectValidAction(action);
      });

      it("should handle only outputSchema", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ outputSchema: testSchemas.string })
            .handler(async () => "output only"),
        );
        expectValidAction(action);
      });

      it("should handle only bindSchemas", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ bindSchemas: [testSchemas.number] as const })
            .handler(testHandlers.bindArgChecker),
        );
        expectValidAction(action);
      });

      it("should handle empty bindSchemas array", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({
              inputSchema: testSchemas.string,
              bindSchemas: [] as const,
            })
            .handler(testHandlers.bindArgValidator),
        );
        expectValidAction(action);
      });

      it("should handle single bindSchema", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ bindSchemas: [testSchemas.string] as const })
            .handler(testHandlers.bindArgProcessor),
        );
        expectValidAction(action);
      });

      it("should handle all schema types together", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({
              inputSchema: testSchemas.string,
              outputSchema: testSchemas.string,
              bindSchemas: [testSchemas.number, testSchemas.user] as const,
            })
            .handler(testHandlers.withBindArgs),
        );
        expectValidAction(action);
      });
    });

    describe("Error definition edge cases", () => {
      it("should handle empty errors object", () => {
        const action = createAction((builder: any) =>
          builder.errors({}).handler(testHandlers.errorValidator),
        );
        expectValidAction(action);
      });

      it("should handle single error definition", () => {
        const action = createAction((builder: any) =>
          builder
            .errors({ singleError: commonErrors.singleError })
            .handler(testHandlers.singleErrorValidator),
        );
        expectValidAction(action);
      });

      it("should handle error with complex parameters", () => {
        const action = createAction((builder: any) =>
          builder
            .errors({ complexError: commonErrors.complexError })
            .handler(testHandlers.complexErrorValidator),
        );
        expectValidAction(action);
      });
    });

    describe("Callback edge cases", () => {
      it("should handle partial callback definitions", () => {
        const onSuccessOnly = createAction((builder: any) =>
          builder
            .handler(async () => "test")
            .callbacks({ onSuccess: mockCallbacks.onSuccess }),
        );

        const onErrorOnly = createAction((builder: any) =>
          builder
            .handler(async () => "test")
            .callbacks({ onError: mockCallbacks.onError }),
        );

        const onSettledOnly = createAction((builder: any) =>
          builder
            .handler(async () => "test")
            .callbacks({ onSettled: mockCallbacks.onSettled }),
        );

        expectValidAction(onSuccessOnly);
        expectValidAction(onErrorOnly);
        expectValidAction(onSettledOnly);
      });

      it("should handle async callbacks", () => {
        const action = createAction((builder: any) =>
          builder.handler(async () => "test").callbacks(mockCallbacks.async),
        );
        expectValidAction(action);
      });

      it("should handle callbacks with complex logic", () => {
        const action = createAction((builder: any) =>
          builder
            .schemas({ inputSchema: testSchemas.string })
            .handler(testHandlers.identity)
            .callbacks(mockCallbacks.complex),
        );
        expectValidAction(action);
      });
    });

    describe("Error scenarios", () => {
      it("should throw error if craft() is called without handler on empty builder", () => {
        expect(() => {
          createAction((builder: any) => builder);
        }).toThrow("A handler implementation is required");
      });

      it("should throw error if craft() is called after schemas but no handler", () => {
        expect(() => {
          createAction((builder: any) =>
            builder.schemas({ inputSchema: testSchemas.string }),
          );
        }).toThrow("A handler implementation is required");
      });

      it("should throw error if craft() is called after errors but no handler", () => {
        expect(() => {
          createAction((builder: any) =>
            builder.errors({ testError: commonErrors.testError }),
          );
        }).toThrow("A handler implementation is required");
      });

      it("should throw error if craft() is called after callbacks reset by schemas", () => {
        expect(() => {
          createAction((builder: any) =>
            builder
              .handler(async () => "test")
              .callbacks({ onSuccess: mockCallbacks.onSuccess })
              .schemas({ inputSchema: testSchemas.string }),
          );
        }).toThrow("A handler implementation is required");
      });
    });
  });
});
