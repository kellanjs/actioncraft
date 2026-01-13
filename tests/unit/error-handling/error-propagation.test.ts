import { actioncraft, initial } from "../../../src/index";
import { getActionId } from "../../../src/utils";
import { stringSchema, numberSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Error Composition and Edge Cases", () => {
  it("should handle custom errors combined with validation errors", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: stringSchema })
      .errors({
        businessError: (reason: string) =>
          ({
            type: "BUSINESS_ERROR",
            reason,
          }) as const,
      })
      .handler(async ({ input, errors }) => {
        if (input === "business-fail") {
          return errors.businessError("Business logic violation");
        }
        return input.toUpperCase();
      })
      .build();

    // Test input validation error
    // @ts-expect-error - Testing invalid input
    const validationResult = await action(123);
    expect(validationResult.success).toBe(false);
    if (!validationResult.success) {
      expect(validationResult.error.type).toBe("INPUT_VALIDATION");
    }

    // Test custom business error
    const businessResult = await action("business-fail");
    expect(businessResult.success).toBe(false);
    if (!businessResult.success) {
      expect(businessResult.error.type).toBe("BUSINESS_ERROR");
    }

    // Test success case
    const successResult = await action("valid");
    expect(successResult.success).toBe(true);
    if (successResult.success) {
      expect(successResult.data).toBe("VALID");
    }
  });

  it("should handle errors in actions without schemas", async () => {
    const action = actioncraft()
      .errors({
        noSchemaError: (message: string) =>
          ({
            type: "NO_SCHEMA_ERROR",
            message,
          }) as const,
      })
      .handler(async ({ errors }) => {
        return errors.noSchemaError("Error without schema validation");
      })
      .build();

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("NO_SCHEMA_ERROR");
      expect(result.error.message).toBe("Error without schema validation");
    }
  });

  it("should handle errors with bind arguments", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [numberSchema] as const,
      })
      .errors({
        bindError: (bindValue: number, inputValue: string) =>
          ({
            type: "BIND_ERROR",
            bindValue,
            inputValue,
          }) as const,
      })
      .handler(async ({ input, bindArgs, errors }) => {
        const [multiplier] = bindArgs;
        if ((multiplier as number) > 10) {
          return errors.bindError(multiplier as number, input as string);
        }
        return (input as string).repeat(multiplier as number);
      })
      .build();

    // Test bind args validation error
    // @ts-expect-error - Testing invalid bind args
    const bindValidationResult = await action("invalid", "test");
    expect(bindValidationResult.success).toBe(false);
    if (!bindValidationResult.success) {
      expect(bindValidationResult.error.type).toBe("BIND_ARGS_VALIDATION");
    }

    // Test custom bind error
    const bindErrorResult = await action(15, "test"); // Multiplier > 10 triggers custom error
    expect(bindErrorResult.success).toBe(false);
    if (!bindErrorResult.success) {
      expect(bindErrorResult.error.type).toBe("BIND_ERROR");
      // @ts-expect-error - Testing specific error properties after type check
      expect(bindErrorResult.error.bindValue).toBe(15);
      // @ts-expect-error - Testing specific error properties after type check
      expect(bindErrorResult.error.inputValue).toBe("test");
    }

    // Test success case
    const successResult = await action(3, "Hi");
    expect(successResult.success).toBe(true);
    if (successResult.success) {
      expect(successResult.data).toBe("HiHiHi");
    }
  });

  it("should handle errors with useActionState configuration", async () => {
    const action = actioncraft()
      .config({
        useActionState: true,
      })
      .errors({
        stateError: (message: string) =>
          ({
            type: "STATE_ERROR",
            message,
          }) as const,
      })
      .handler(async ({ errors, metadata }) => {
        if (
          metadata.prevState &&
          !metadata.prevState.success &&
          metadata.prevState.error.type === "STATE_ERROR"
        ) {
          return errors.stateError("Repeated state error");
        }
        return errors.stateError("Initial state error");
      })
      .build();

    const initialResult = await action({
      success: false,
      // @ts-expect-error - Testing with mock previous state
      error: { type: "UNHANDLED", message: "Previous error" },
    });

    expect(initialResult.success).toBe(false);
    if (!initialResult.success) {
      expect(initialResult.error.type).toBe("STATE_ERROR");
      expect(initialResult.error.message).toBe("Initial state error");
    }
  });

  it("should handle error data references correctly", async () => {
    const action = actioncraft()
      .errors({
        dataError: (data: Record<string, unknown>) =>
          ({
            type: "DATA_ERROR",
            data,
            timestamp: Date.now(),
          }) as const,
      })
      .handler(async ({ errors }) => {
        const errorData = { original: "value" };
        return errors.dataError(errorData);
      })
      .build();

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("DATA_ERROR");
      // @ts-expect-error - Testing specific error properties after type check
      expect(result.error.data).toEqual({ original: "value" });
      // @ts-expect-error - Testing specific error properties after type check
      expect(typeof result.error.timestamp).toBe("number");

      // Verify error structure
      expect(typeof result.error).toBe("object");
      expect("data" in result.error).toBe(true);
      expect("timestamp" in result.error).toBe(true);
    }
  });

  it("should include raw input in values on validation error when useActionState is enabled", async () => {
    const action = actioncraft()
      .config({
        useActionState: true,
      })
      .schemas({ inputSchema: stringSchema })
      .handler(async ({ input }) => {
        return input;
      })
      .build();

    // Trigger validation error by passing non-string input
    // useActionState signature: (previousState, input)
    const initialState = initial(action);
    const result = await action(initialState, 123 as any);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect(result.values).toBe(123);
    }
  });
});

describe("Action ID in Error Scenarios", () => {
  it("should include action ID in all custom error results", async () => {
    const action = actioncraft()
      .errors({
        businessError: (code: number) => ({
          type: "BUSINESS_ERROR" as const,
          code,
        }),
        validationError: (field: string) => ({
          type: "VALIDATION_ERROR" as const,
          field,
        }),
        authError: () => ({ type: "AUTH_ERROR" as const }),
      })
      .handler(async ({ errors }) => {
        if (Math.random() > 0.7) {
          return errors.businessError(500);
        } else if (Math.random() > 0.3) {
          return errors.validationError("email");
        } else {
          return errors.authError();
        }
      })
      .build();

    const result = await action();
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    expect(typeof result.__ac_id).toBe("string");
    expect(result.__ac_id.length).toBeGreaterThan(0);
  });

  it("should include action ID in input validation errors", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: stringSchema })
      .handler(async ({ input }) => input)
      .build();

    // @ts-expect-error - Testing invalid input
    const result = await action(123);
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
    }
  });

  it("should include action ID in bind args validation errors", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        bindSchemas: [numberSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => ({ input, bindArgs }))
      .build();

    // @ts-expect-error - Testing invalid bind args
    const result = await action("invalid", "test");
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    if (!result.success) {
      expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
    }
  });

  it("should include action ID in output validation errors (client sees UNHANDLED)", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: stringSchema,
        outputSchema: numberSchema,
      })
      .handler(async ({ input }) => input) // Returns string when number expected
      .build();

    const result = await action("not-a-number");
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  it("should include action ID in unhandled thrown errors", async () => {
    const action = actioncraft()
      .handler(async () => {
        throw new Error("Unhandled error");
      })
      .build();

    const result = await action();
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  it("should include action ID in custom thrown error handler results", async () => {
    const action = actioncraft()
      .config({
        handleThrownError: (error: unknown) => ({
          type: "CUSTOM_THROWN_ERROR" as const,
          message: error instanceof Error ? error.message : String(error),
        }),
      })
      .handler(async () => {
        throw new Error("Custom handled error");
      })
      .build();

    const result = await action();
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    if (!result.success) {
      expect(result.error.type).toBe("CUSTOM_THROWN_ERROR");
    }
  });

  it("should include action ID in implicit return errors", async () => {
    const action = actioncraft()
      .handler(async () => {
        // Implicit return undefined
      })
      .build();

    const result = await action();
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
    }
  });

  it("should include action ID in errors across different result formats", async () => {
    const errorDef = {
      formatError: (format: string) => ({
        type: "FORMAT_ERROR" as const,
        format,
      }),
    };

    // API format
    const apiAction = actioncraft()
      .errors(errorDef)
      .handler(async ({ errors }) => errors.formatError("api"))
      .build();

    // Functional format
    const functionalAction = actioncraft()
      .config({ resultFormat: "functional" })
      .errors(errorDef)
      .handler(async ({ errors }) => errors.formatError("functional"))
      .build();

    // useActionState format
    const stateAction = actioncraft()
      .config({ useActionState: true })
      .errors(errorDef)
      .handler(async ({ errors }) => errors.formatError("state"))
      .build();

    const apiResult = await apiAction();
    const functionalResult = await functionalAction();
    const stateResult = await stateAction(initial(stateAction));

    const apiActionId = getActionId(apiAction);
    const functionalActionId = getActionId(functionalAction);
    const stateActionId = getActionId(stateAction as any);

    // All should have their respective action IDs
    expect(apiResult.__ac_id).toBe(apiActionId);
    expect(functionalResult.__ac_id).toBe(functionalActionId);
    expect(stateResult.__ac_id).toBe(stateActionId);

    // All should be errors
    expect(apiResult.success).toBe(false);
    expect(functionalResult.type).toBe("err");
    expect(stateResult.success).toBe(false);
  });

  it("should maintain action ID consistency in error callbacks", async () => {
    const capturedActionIds: string[] = [];

    const action = actioncraft()
      .errors({
        callbackError: () => ({ type: "CALLBACK_ERROR" as const }),
      })
      .handler(async ({ errors, metadata }) => {
        capturedActionIds.push(metadata.actionId);
        return errors.callbackError();
      })
      .callbacks({
        onStart: async ({ metadata }) => {
          capturedActionIds.push(metadata.actionId);
        },
        onError: async ({ metadata }) => {
          capturedActionIds.push(metadata.actionId);
        },
        onSettled: async ({ metadata }) => {
          capturedActionIds.push(metadata.actionId);
        },
      })
      .build();

    const result = await action();
    const actionId = getActionId(action);

    expect(result.success).toBe(false);
    expect(result.__ac_id).toBe(actionId);
    expect(capturedActionIds).toHaveLength(4);
    expect(capturedActionIds.every((id) => id === actionId)).toBe(true);
  });

  it("should handle action ID in complex error scenarios with multiple validation layers", async () => {
    const action = actioncraft()
      .schemas({
        inputSchema: z.object({
          email: z.string().email(),
          age: z.number().min(18),
        }),
        bindSchemas: [z.string().min(1)] as const,
        outputSchema: z.object({
          user: z.object({
            id: z.string(),
            email: z.string(),
            age: z.number(),
          }),
        }),
      })
      .errors({
        businessLogicError: (reason: string) => ({
          type: "BUSINESS_LOGIC_ERROR" as const,
          reason,
        }),
      })
      .handler(async ({ input, bindArgs, errors }) => {
        const [prefix] = bindArgs;

        if (input.age < 21) {
          return errors.businessLogicError("Age restriction");
        }

        return {
          user: {
            id: `${prefix}-${Date.now()}`,
            email: input.email,
            age: input.age,
          },
        };
      })
      .build();

    const actionId = getActionId(action);

    // Test input validation error
    const inputError = await action("valid-prefix", {
      email: "invalid-email",
      age: 16,
    });
    expect(inputError.success).toBe(false);
    expect(inputError.__ac_id).toBe(actionId);

    // Test bind args validation error
    const bindError = await action("", {
      email: "valid@example.com",
      age: 25,
    });
    expect(bindError.success).toBe(false);
    expect(bindError.__ac_id).toBe(actionId);

    // Test business logic error
    const businessError = await action("valid-prefix", {
      email: "valid@example.com",
      age: 20,
    });
    expect(businessError.success).toBe(false);
    expect(businessError.__ac_id).toBe(actionId);
    if (!businessError.success) {
      expect(businessError.error.type).toBe("BUSINESS_LOGIC_ERROR");
    }

    // Test success case
    const success = await action("valid-prefix", {
      email: "valid@example.com",
      age: 25,
    });
    expect(success.success).toBe(true);
    expect(success.__ac_id).toBe(actionId);
  });
});

describe("Action Name in Error Messages", () => {
  it("should include action name in validation error messages", async () => {
    const action = actioncraft()
      .config({
        actionName: "updateUserProfile",
      })
      .schemas({ inputSchema: numberSchema })
      .handler(async ({ input }) => {
        return input * 2;
      })
      .build();

    // Test input validation error with action name
    const result = await action("not-a-number" as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect(result.error.message).toContain("updateUserProfile");
      expect(result.error.message).toBe(
        'Input validation failed in action "updateUserProfile"',
      );
    }
  });

  it("should include action name in unhandled error messages", async () => {
    const action = actioncraft()
      .config({
        actionName: "processPayment",
      })
      .handler(async () => {
        throw new Error("Payment gateway error");
      })
      .build();

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED");
      expect(result.error.message).toContain("processPayment");
      expect(result.error.message).toBe(
        'An unhandled error occurred in action "processPayment"',
      );
    }
  });

  it("should include action name in implicit return error messages", async () => {
    const action = actioncraft()
      .config({
        actionName: "calculateTotal",
      })
      .handler(async () => {
        // Implicit return (undefined)
        const total = 100 + 50;
        // Missing return statement
      })
      .build();

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED"); // Client sees generic error
    }
  });

  it("should include action name in bind args validation error messages", async () => {
    const action = actioncraft()
      .config({
        actionName: "multiplyNumbers",
      })
      .schemas({
        inputSchema: numberSchema,
        bindSchemas: [stringSchema] as const,
      })
      .handler(async ({ input, bindArgs }) => {
        return input * parseInt(bindArgs[0] as string);
      })
      .build();

    // Test bind args validation error with action name
    const result = await action(123 as any, 5); // bindArgs should be string, not number
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("BIND_ARGS_VALIDATION");
      expect(result.error.message).toContain("multiplyNumbers");
      expect(result.error.message).toBe(
        'Bind arguments validation failed in action "multiplyNumbers"',
      );
    }
  });

  it("should include action name in metadata for callbacks", async () => {
    let capturedMetadata: any = null;

    const action = actioncraft()
      .config({
        actionName: "testAction",
      })
      .schemas({ inputSchema: stringSchema })
      .handler(async ({ input }) => {
        return input.toUpperCase();
      })
      .callbacks({
        onSuccess: ({ metadata }) => {
          capturedMetadata = metadata;
        },
      })
      .build();

    const result = await action("hello");
    expect(result.success).toBe(true);

    expect(capturedMetadata).not.toBeNull();
    expect(capturedMetadata.actionName).toBe("testAction");
    expect(capturedMetadata.actionId).toBeDefined();
  });

  it("should work without action name (backward compatibility)", async () => {
    const action = actioncraft()
      .schemas({ inputSchema: numberSchema })
      .handler(async ({ input }) => {
        return input * 2;
      })
      .build();

    // Test that validation errors work without action name
    const result = await action("not-a-number" as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect(result.error.message).toBe("Input validation failed");
      expect(result.error.message).not.toContain("in action");
    }
  });

  it("should work with empty action name", async () => {
    const action = actioncraft()
      .config({
        actionName: "",
      })
      .schemas({ inputSchema: numberSchema })
      .handler(async ({ input }) => {
        return input * 2;
      })
      .build();

    const result = await action("not-a-number" as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect(result.error.message).toBe("Input validation failed");
      expect(result.error.message).not.toContain("in action");
    }
  });

  it("should handle special characters in action names", async () => {
    const action = actioncraft()
      .config({
        actionName: "user-profile:update_v2",
      })
      .schemas({ inputSchema: numberSchema })
      .handler(async ({ input }) => {
        return input * 2;
      })
      .build();

    const result = await action("not-a-number" as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect(result.error.message).toBe(
        'Input validation failed in action "user-profile:update_v2"',
      );
    }
  });
});
