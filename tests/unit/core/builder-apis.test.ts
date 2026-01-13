import { actioncraft } from "../../../src/index";
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
import { describe, it, expect } from "vitest";

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
 * Test suite for the actioncraft() API
 */
describe("Actioncraft API", () => {
  describe("actioncraft() function", () => {
    it("should create a crafted action using fluent API", () => {
      const action = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .build();
      expectValidAction(action);
    });

    it("should accept configuration", () => {
      const action = actioncraft()
        .config(testConfigs.flattenedFunctional)
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });

    it("should accept useActionState configuration", () => {
      const action = actioncraft()
        .config(testConfigs.useActionState)
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });
  });

  describe("Method chaining", () => {
    it("should allow chaining schemas -> errors -> handler", () => {
      const action = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .errors({ validationError: commonErrors.validationError })
        .handler(testHandlers.uppercase)
        .build();
      expectValidAction(action);
    });

    it("should allow chaining in different orders", () => {
      const action1 = actioncraft()
        .errors({ customError: commonErrors.customError })
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .build();

      const action2 = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .build();

      expectValidAction(action1);
      expectValidAction(action2);
    });

    it("should allow callbacks after handler", () => {
      const action = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .callbacks({
          onSuccess: mockCallbacks.onSuccess,
          onError: mockCallbacks.onError,
        })
        .build();
      expectValidAction(action);
    });

    it("should allow config -> schemas -> errors -> handler -> callbacks -> build", () => {
      const action = actioncraft()
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
        })
        .build();
      expectValidAction(action);
    });
  });

  describe("Configuration options", () => {
    it("should handle validationErrorFormat configuration", () => {
      const flattenedAction = actioncraft()
        .config(testConfigs.flattened)
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .build();

      const nestedAction = actioncraft()
        .config(testConfigs.nested)
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .build();

      expectValidAction(flattenedAction);
      expectValidAction(nestedAction);
    });

    it("should handle resultFormat configuration", () => {
      const functionalAction = actioncraft()
        .config(testConfigs.functional)
        .handler(async () => "test")
        .build();

      const apiAction = actioncraft()
        .config(testConfigs.api)
        .handler(async () => "test")
        .build();

      expectValidAction(functionalAction);
      expectValidAction(apiAction);
    });

    it("should handle custom error handler", () => {
      const action = actioncraft()
        .config(testConfigs.customErrorHandler)
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });
  });

  describe("Schema types", () => {
    it("should handle multiple schemas", () => {
      const action = actioncraft()
        .schemas({
          inputSchema: testSchemas.string,
          outputSchema: testSchemas.string,
          bindSchemas: [testSchemas.number, testSchemas.user] as const,
        })
        .handler(testHandlers.withBindArgs)
        .build();
      expectValidAction(action);
    });

    it("should work without input schema", () => {
      const action = actioncraft().handler(testHandlers.noInput).build();
      expectValidAction(action);
    });
  });

  describe("Error handling", () => {
    it("should throw error if build() is called without handler", () => {
      expect(() => {
        actioncraft().schemas({ inputSchema: testSchemas.string }).build();
      }).toThrow("A handler implementation is required");
    });

    it("should accept multiple error definitions", () => {
      const action = actioncraft()
        .errors({
          notFound: commonErrors.notFound,
          unauthorized: commonErrors.unauthorized,
          validationFailed: commonErrors.validationFailed,
        })
        .handler(testHandlers.multiErrorValidator)
        .build();
      expectValidAction(action);
    });
  });

  describe("Advanced chaining scenarios", () => {
    it("should reset callbacks when schemas() is called after handler", () => {
      const action = actioncraft()
        .handler(async () => "test")
        .callbacks({ onSuccess: mockCallbacks.onSuccess })
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .build();
      expectValidAction(action);
    });

    it("should reset callbacks when errors() is called after handler", () => {
      const action = actioncraft()
        .handler(async () => "test")
        .callbacks({ onSuccess: mockCallbacks.onSuccess })
        .errors({ customError: commonErrors.customError })
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });

    it("should reset callbacks when handler() is called again", () => {
      const action = actioncraft()
        .handler(async () => "first")
        .callbacks({ onSuccess: mockCallbacks.onSuccess })
        .handler(async () => "second")
        .build();
      expectValidAction(action);
    });

    it("should allow multiple schemas() calls", () => {
      const action = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .schemas({ inputSchema: testSchemas.number })
        .handler(testHandlers.identity)
        .build();
      expectValidAction(action);
    });

    it("should allow multiple errors() calls", () => {
      const action = actioncraft()
        .errors({ firstError: commonErrors.firstError })
        .errors({ secondError: commonErrors.secondError })
        .handler(testHandlers.secondErrorValidator)
        .build();
      expectValidAction(action);
    });

    it("should use schemas from the last schemas() call for validation", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .schemas({ inputSchema: testSchemas.number })
        .handler(testHandlers.multiply)
        .build();

      const validResult = await action(commonTestData.validNumber);
      expectSuccessResult(validResult, commonTestData.expectedDoubled);

      const invalidResult = await action(commonTestData.invalidString as any);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should use errors from the last errors() call", async () => {
      const action = actioncraft()
        .errors({ first: commonErrors.firstError })
        .errors({ second: commonErrors.secondError })
        .handler(async ({ errors }: any) => {
          return errors.second();
        })
        .build();

      const result = await action();
      expectErrorResult(result, { type: "SECOND" });
    });
  });

  describe("Configuration edge cases", () => {
    it("should handle empty configuration object", () => {
      const action = actioncraft()
        .config({})
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });

    it("should handle useActionState with explicit resultFormat", () => {
      const action = actioncraft()
        .config(testConfigs.useActionStateApi)
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });

    it("should handle all validation format combinations", () => {
      const nestedAction = actioncraft()
        .config(testConfigs.nestedApi)
        .handler(async () => "test")
        .build();

      const flattenedAction = actioncraft()
        .config(testConfigs.flattenedFunctional)
        .handler(async () => "test")
        .build();

      expectValidAction(nestedAction);
      expectValidAction(flattenedAction);
    });

    it("should handle complex custom error handler", () => {
      const action = actioncraft()
        .config(testConfigs.complexCustomHandler)
        .handler(async () => "test")
        .build();
      expectValidAction(action);
    });
  });

  describe("Schema edge cases", () => {
    it("should handle empty schemas object", () => {
      const action = actioncraft()
        .schemas({})
        .handler(async () => "no schemas")
        .build();
      expectValidAction(action);
    });

    it("should handle only outputSchema", () => {
      const action = actioncraft()
        .schemas({ outputSchema: testSchemas.string })
        .handler(async () => "output only")
        .build();
      expectValidAction(action);
    });

    it("should handle only bindSchemas", () => {
      const action = actioncraft()
        .schemas({ bindSchemas: [testSchemas.number] as const })
        .handler(testHandlers.bindArgChecker)
        .build();
      expectValidAction(action);
    });

    it("should handle empty bindSchemas array", () => {
      const action = actioncraft()
        .schemas({
          inputSchema: testSchemas.string,
          bindSchemas: [] as const,
        })
        .handler(testHandlers.bindArgValidator)
        .build();
      expectValidAction(action);
    });

    it("should handle single bindSchema", () => {
      const action = actioncraft()
        .schemas({ bindSchemas: [testSchemas.string] as const })
        .handler(testHandlers.bindArgProcessor)
        .build();
      expectValidAction(action);
    });

    it("should handle all schema types together", () => {
      const action = actioncraft()
        .schemas({
          inputSchema: testSchemas.string,
          outputSchema: testSchemas.string,
          bindSchemas: [testSchemas.number, testSchemas.user] as const,
        })
        .handler(testHandlers.withBindArgs)
        .build();
      expectValidAction(action);
    });
  });

  describe("Error definition edge cases", () => {
    it("should handle empty errors object", () => {
      const action = actioncraft()
        .errors({})
        .handler(testHandlers.errorValidator)
        .build();
      expectValidAction(action);
    });

    it("should handle single error definition", () => {
      const action = actioncraft()
        .errors({ singleError: commonErrors.singleError })
        .handler(testHandlers.singleErrorValidator)
        .build();
      expectValidAction(action);
    });

    it("should handle error with complex parameters", () => {
      const action = actioncraft()
        .errors({ complexError: commonErrors.complexError })
        .handler(testHandlers.complexErrorValidator)
        .build();
      expectValidAction(action);
    });
  });

  describe("Callback edge cases", () => {
    it("should handle partial callback definitions", () => {
      const onSuccessOnly = actioncraft()
        .handler(async () => "test")
        .callbacks({ onSuccess: mockCallbacks.onSuccess })
        .build();

      const onErrorOnly = actioncraft()
        .handler(async () => "test")
        .callbacks({ onError: mockCallbacks.onError })
        .build();

      const onSettledOnly = actioncraft()
        .handler(async () => "test")
        .callbacks({ onSettled: mockCallbacks.onSettled })
        .build();

      expectValidAction(onSuccessOnly);
      expectValidAction(onErrorOnly);
      expectValidAction(onSettledOnly);
    });

    it("should handle async callbacks", () => {
      const action = actioncraft()
        .handler(async () => "test")
        .callbacks(mockCallbacks.async)
        .build();
      expectValidAction(action);
    });

    it("should handle callbacks with complex logic", () => {
      const action = actioncraft()
        .schemas({ inputSchema: testSchemas.string })
        .handler(testHandlers.identity)
        .callbacks(mockCallbacks.complex)
        .build();
      expectValidAction(action);
    });
  });

  describe("Error scenarios", () => {
    it("should throw error if build() is called without handler on empty builder", () => {
      expect(() => {
        actioncraft().build();
      }).toThrow("A handler implementation is required");
    });

    it("should throw error if build() is called after schemas but no handler", () => {
      expect(() => {
        actioncraft().schemas({ inputSchema: testSchemas.string }).build();
      }).toThrow("A handler implementation is required");
    });

    it("should throw error if build() is called after errors but no handler", () => {
      expect(() => {
        actioncraft().errors({ testError: commonErrors.testError }).build();
      }).toThrow("A handler implementation is required");
    });

    it("should throw error if build() is called after callbacks reset by schemas", () => {
      expect(() => {
        actioncraft()
          .handler(async () => "test")
          .callbacks({ onSuccess: mockCallbacks.onSuccess })
          .schemas({ inputSchema: testSchemas.string })
          .build();
      }).toThrow("A handler implementation is required");
    });
  });
});
