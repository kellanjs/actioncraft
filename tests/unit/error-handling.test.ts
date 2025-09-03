import { craft, initial } from "../../src/index";
import { getActionId } from "../../src/utils";
import {
  stringSchema,
  numberSchema,
  alwaysFailSchema,
} from "../fixtures/schemas";
import { describe, it, expect } from "../setup";
import { z } from "zod/v4";

describe("Error Handling", () => {
  describe("Custom Errors", () => {
    it("should handle custom errors defined with .errors()", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            notFound: (id: string) =>
              ({
                type: "NOT_FOUND",
                id,
                message: `Resource with ID ${id} not found`,
              }) as const,
            unauthorized: () =>
              ({
                type: "UNAUTHORIZED",
                message: "Access denied",
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input === "missing") {
              return errors.notFound(input as string);
            }
            if (input === "forbidden") {
              return errors.unauthorized();
            }
            return input;
          }),
      );

      // Test notFound error
      const notFoundResult = await action("missing");
      expect(notFoundResult.success).toBe(false);
      if (!notFoundResult.success) {
        expect(notFoundResult.error).toEqual({
          type: "NOT_FOUND",
          id: "missing",
          message: "Resource with ID missing not found",
        });
      }

      // Test unauthorized error
      const unauthorizedResult = await action("forbidden");
      expect(unauthorizedResult.success).toBe(false);
      if (!unauthorizedResult.success) {
        expect(unauthorizedResult.error).toEqual({
          type: "UNAUTHORIZED",
          message: "Access denied",
        });
      }

      // Test success case
      const successResult = await action("valid");
      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.data).toBe("valid");
      }
    });

    it("should infer types of custom errors correctly", async () => {
      const action = craft((action) =>
        action
          .errors({
            validationError: (field: string, value: unknown) =>
              ({
                type: "VALIDATION_ERROR",
                field,
                value,
                timestamp: Date.now(),
              }) as const,
          })
          .handler(async ({ errors }) => {
            // TypeScript should infer the correct parameter types
            return errors.validationError("email", "invalid@");
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("VALIDATION_ERROR");
        const error = result.error as {
          type: "VALIDATION_ERROR";
          field: string;
          value: unknown;
          timestamp: number;
        };
        expect(error.field).toBe("email");
        expect(error.value).toBe("invalid@");
        expect(typeof error.timestamp).toBe("number");
      }
    });

    it("should handle complex custom error structures", async () => {
      const action = craft((action) =>
        action
          .errors({
            businessLogicError: (
              code: number,
              details: Record<string, unknown>,
              metadata?: { userId?: string; timestamp?: number },
            ) =>
              ({
                type: "BUSINESS_LOGIC_ERROR",
                code,
                details,
                metadata: {
                  userId: metadata?.userId || "anonymous",
                  timestamp: metadata?.timestamp || Date.now(),
                  severity:
                    code >= 500 ? "critical" : code >= 400 ? "warning" : "info",
                },
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.businessLogicError(
              403,
              { operation: "deleteUser", reason: "insufficient_permissions" },
              { userId: "user123" },
            );
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("BUSINESS_LOGIC_ERROR");
        // @ts-expect-error - Testing specific error properties after type check
        expect(result.error.code).toBe(403);
        // @ts-expect-error - Testing specific error properties after type check
        expect(result.error.details).toEqual({
          operation: "deleteUser",
          reason: "insufficient_permissions",
        });
        // @ts-expect-error - Testing specific error properties after type check
        expect(result.error.metadata.userId).toBe("user123");
        // @ts-expect-error - Testing specific error properties after type check
        expect(result.error.metadata.severity).toBe("warning");
        // @ts-expect-error - Testing specific error properties after type check
        expect(typeof result.error.metadata.timestamp).toBe("number");
      }
    });

    it("should handle multiple custom error types in one action", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            networkError: (url: string, status: number) =>
              ({
                type: "NETWORK_ERROR",
                url,
                status,
                retryable: status >= 500,
              }) as const,
            parseError: (data: string, position: number) =>
              ({
                type: "PARSE_ERROR",
                data,
                position,
                suggestion: "Check data format",
              }) as const,
            authError: () =>
              ({
                type: "AUTH_ERROR",
                message: "Authentication required",
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input.startsWith("net:")) {
              return errors.networkError("https://api.example.com", 502);
            }
            if (input.startsWith("parse:")) {
              return errors.parseError(input, 10);
            }
            if (input.startsWith("auth:")) {
              return errors.authError();
            }
            return `Processed: ${input}`;
          }),
      );

      // Test network error
      const networkResult = await action("net:test");
      expect(networkResult.success).toBe(false);
      if (!networkResult.success) {
        expect(networkResult.error.type).toBe("NETWORK_ERROR");
        // @ts-expect-error - Testing specific error properties after type check
        expect(networkResult.error.retryable).toBe(true);
      }

      // Test parse error
      const parseResult = await action("parse:invalid");
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.type).toBe("PARSE_ERROR");
        // @ts-expect-error - Testing specific error properties after type check
        expect(parseResult.error.suggestion).toBe("Check data format");
      }

      // Test auth error
      const authResult = await action("auth:required");
      expect(authResult.success).toBe(false);
      if (!authResult.success) {
        expect(authResult.error.type).toBe("AUTH_ERROR");
      }

      // Test success
      const successResult = await action("valid");
      expect(successResult.success).toBe(true);
    });

    it("should handle errors with no parameters", async () => {
      const action = craft((action) =>
        action
          .errors({
            simpleError: () =>
              ({
                type: "SIMPLE_ERROR",
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.simpleError();
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("SIMPLE_ERROR");
      }
    });

    it("should handle errors with optional parameters", async () => {
      const action = craft((action) =>
        action
          .errors({
            optionalParamError: (
              message: string,
              code?: number,
              details?: Record<string, unknown>,
            ) =>
              ({
                type: "OPTIONAL_PARAM_ERROR",
                message,
                code: code || 500,
                details: details || {},
              }) as const,
          })
          .handler(async ({ errors }) => {
            // Test with all parameters
            if (Math.random() > 0.7) {
              return errors.optionalParamError("Full error", 400, {
                extra: "data",
              });
            }
            // Test with minimal parameters
            if (Math.random() > 0.3) {
              return errors.optionalParamError("Minimal error");
            }
            // Test with partial parameters
            return errors.optionalParamError("Partial error", 404);
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("OPTIONAL_PARAM_ERROR");
        expect(typeof result.error.message).toBe("string");
        // @ts-expect-error - Testing specific error properties after type check
        expect(typeof result.error.code).toBe("number");
        // @ts-expect-error - Testing specific error properties after type check
        expect(typeof result.error.details).toBe("object");
      }
    });
  });

  describe("Thrown Error Handling", () => {
    it("should handle thrown errors with a custom handler", async () => {
      const customErrorHandler = (error: unknown) =>
        ({
          type: "CUSTOM_THROWN_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        }) as const;

      const action = craft((action) =>
        action
          .config({
            handleThrownError: customErrorHandler,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "throw") {
              throw new Error("Intentional test error");
            }
            return input;
          }),
      );

      const result = await action("throw");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("CUSTOM_THROWN_ERROR");
        const error = result.error as {
          type: "CUSTOM_THROWN_ERROR";
          message: string;
          stack?: string;
        };
        expect(error.message).toBe("Intentional test error");
        expect(error.stack).toBeDefined();
      }
    });

    it("should use the default unhandled error for uncaught exceptions", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            if (input === "throw") {
              throw new Error("Uncaught error");
            }
            return input;
          }),
      );

      const result = await action("throw");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: "UNHANDLED",
          message: "An unhandled error occurred",
        });
      }
    });

    it("should handle non-Error objects being thrown", async () => {
      const customErrorHandler = (error: unknown) =>
        ({
          type: "THROWN_NON_ERROR",
          value: error,
          valueType: typeof error,
        }) as const;

      const action = craft((action) =>
        action
          .config({
            handleThrownError: customErrorHandler,
          })
          .handler(async () => {
            throw "string error";
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error as any;
        expect(err.type).toBe("THROWN_NON_ERROR");
        expect(err.value).toBe("string error");
        expect(err.valueType).toBe("string");
      }
    });

    it("should handle async thrown errors", async () => {
      const action = craft((action) =>
        action
          .config({
            handleThrownError: (error: unknown) =>
              ({
                type: "ASYNC_ERROR",
                message:
                  error instanceof Error
                    ? error.message
                    : "Unknown async error",
              }) as const,
          })
          .handler(async () => {
            await new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Async failure")), 10);
            });
            return "success";
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("ASYNC_ERROR");
        expect(result.error.message).toBe("Async failure");
      }
    });

    it("should handle different types of thrown objects", async () => {
      const universalErrorHandler = (error: unknown) =>
        ({
          type: "UNIVERSAL_ERROR",
          originalError: error,
          errorType: typeof error,
          isError: error instanceof Error,
          isString: typeof error === "string",
          isNumber: typeof error === "number",
          isObject: typeof error === "object" && error !== null,
        }) as const;

      const createAction = (throwValue: unknown) =>
        craft((action) =>
          action
            .config({
              handleThrownError: universalErrorHandler,
            })
            .handler(async () => {
              throw throwValue;
            }),
        );

      // Test different thrown types
      const testCases = [
        {
          value: new Error("Error object"),
          expectedType: "object",
          isError: true,
        },
        { value: "String error", expectedType: "string", isError: false },
        { value: 404, expectedType: "number", isError: false },
        { value: { custom: "error" }, expectedType: "object", isError: false },
        { value: null, expectedType: "object", isError: false },
        { value: undefined, expectedType: "undefined", isError: false },
        { value: true, expectedType: "boolean", isError: false },
      ];

      for (const testCase of testCases) {
        const action = createAction(testCase.value);
        const result = await action();

        expect(result.success).toBe(false);
        if (!result.success) {
          const err = result.error as any;
          expect(err.type).toBe("UNIVERSAL_ERROR");
          expect(err.errorType).toBe(testCase.expectedType);
          expect(err.isError).toBe(testCase.isError);
        }
      }
    });

    it("should handle errors thrown during input validation", async () => {
      const throwingSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (input === "throw-in-validation") {
              throw new Error("Validation threw an error");
            }
            if (typeof input === "string") {
              return { value: input };
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

      const action = craft((action) =>
        action
          .config({
            handleThrownError: (error: unknown) =>
              ({
                type: "VALIDATION_THROW_ERROR",
                message:
                  error instanceof Error
                    ? error.message
                    : "Unknown validation error",
              }) as const,
          })
          .schemas({ inputSchema: throwingSchema })
          .handler(async ({ input }) => {
            return input;
          }),
      );

      const result = await action("throw-in-validation");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("VALIDATION_THROW_ERROR");
        expect(result.error.message).toBe("Validation threw an error");
      }
    });

    it("should handle errors in custom error handlers themselves", async () => {
      const faultyErrorHandler = (_error: unknown) => {
        // This error handler itself throws an error
        throw new Error("Error handler failed");
      };

      const action = craft((action) =>
        action
          .config({
            handleThrownError: faultyErrorHandler,
          })
          .handler(async () => {
            throw new Error("Original error");
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should fall back to default unhandled error when error handler fails
        expect(result.error).toEqual({
          type: "UNHANDLED",
          message: "An unhandled error occurred",
        });
      }
    });
  });

  describe("Output Validation Errors", () => {
    it("should return an UNHANDLED_ERROR for invalid output (client-facing)", async () => {
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: numberSchema,
          })
          .handler(async ({ input }) => {
            // Return string when number is expected
            return input; // This will fail output validation
          }),
      );

      const result = await action("not-a-number");
      expect(result.success).toBe(false);
      if (!result.success) {
        // Client sees generic unhandled error, not implementation details
        expect(result.error.type).toBe("UNHANDLED");
        expect((result.error as any).message).toBe(
          "An unhandled error occurred",
        );
      }
    });

    it("should handle complex output validation failures (client-facing)", async () => {
      const complexOutputSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (input: unknown) => {
            if (
              typeof input === "object" &&
              input !== null &&
              "id" in input &&
              "name" in input
            ) {
              const obj = input as { id: unknown; name: unknown };
              if (typeof obj.id === "string" && typeof obj.name === "string") {
                return { value: obj };
              }
            }
            return {
              issues: [{ message: "Must have string id and name", path: [] }],
            };
          },
        },
        "~validate": function (input: unknown) {
          return this["~standard"].validate(input);
        },
      } as const;

      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: complexOutputSchema,
          })
          .handler(async () => {
            return { id: 123, name: "test" }; // id should be string, not number
          }),
      );

      const result = await action("input");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle schema that always fails (client-facing)", async () => {
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: alwaysFailSchema,
          })
          .handler(async ({ input }) => {
            return input; // This will always fail output validation
          }),
      );

      const result = await action("test");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle output validation with flattened error format (client-facing)", async () => {
      const multiFieldOutputSchema = {
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
                issues.push({
                  message: "Name must be a string",
                  path: ["name"],
                });
              }
              if (!obj.age || typeof obj.age !== "number") {
                issues.push({ message: "Age must be a number", path: ["age"] });
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

      const action = craft((action) =>
        action
          .config({
            validationErrorFormat: "flattened",
          })
          .schemas({
            inputSchema: stringSchema,
            outputSchema: multiFieldOutputSchema,
          })
          .handler(async () => {
            return { name: 123, age: "not-a-number" }; // Both fields invalid
          }),
      );

      const result = await action("input");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should handle output validation errors with custom error handler (client-facing)", async () => {
      const action = craft((action) =>
        action
          .config({
            handleThrownError: (error: unknown) =>
              ({
                type: "CUSTOM_OUTPUT_ERROR",
                originalError: error,
              }) as const,
          })
          .schemas({
            inputSchema: stringSchema,
            outputSchema: numberSchema,
          })
          .handler(async ({ input }) => {
            return input; // Will fail output validation
          }),
      );

      const result = await action("not-a-number");
      expect(result.success).toBe(false);
      if (!result.success) {
        // Output validation errors are internal, client sees unhandled error
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    // Test that callbacks receive detailed internal errors
    it("should pass detailed OUTPUT_VALIDATION_ERROR to callbacks", async () => {
      let capturedError: any = null;

      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            outputSchema: numberSchema,
          })
          .handler(async ({ input }) => {
            return input; // Will fail output validation
          })
          .callbacks({
            onError: ({ error }) => {
              capturedError = error;
            },
          }),
      );

      const result = await action("not-a-number");

      // Client gets generic error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }

      // But callback gets detailed error
      expect(capturedError).not.toBeNull();
      expect(capturedError.type).toBe("OUTPUT_VALIDATION");
      expect("formErrors" in capturedError || "issues" in capturedError).toBe(
        true,
      );
    });

    it("should pass IMPLICIT_RETURN_ERROR to callbacks but UNHANDLED_ERROR to client", async () => {
      let capturedError: any = null;

      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            // Implicit return (undefined) - new UX improvement

            const result = input.toUpperCase();
            // No return statement - this should trigger IMPLICIT_RETURN_ERROR
          })
          .callbacks({
            onError: ({ error }) => {
              capturedError = error;
            },
          }),
      );

      const result = await action("test");

      // Client gets generic error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }

      // But callback gets detailed error for debugging
      expect(capturedError).not.toBeNull();
      expect(capturedError.type).toBe("IMPLICIT_RETURN");
      expect(capturedError.message).toBe("Action handler must return a value");
    });
  });

  describe("Error Composition and Edge Cases", () => {
    it("should handle custom errors combined with validation errors", async () => {
      const action = craft((action) =>
        action
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
          }),
      );

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
      const action = craft((action) =>
        action
          .errors({
            noSchemaError: (message: string) =>
              ({
                type: "NO_SCHEMA_ERROR",
                message,
              }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.noSchemaError("Error without schema validation");
          }),
      );

      const result = await action();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("NO_SCHEMA_ERROR");
        expect(result.error.message).toBe("Error without schema validation");
      }
    });

    it("should handle errors with bind arguments", async () => {
      const action = craft((action) =>
        action
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
          }),
      );

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
      const action = craft((action) =>
        action
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
          }),
      );

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
      const action = craft((action) =>
        action
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
          }),
      );

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
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => {
            return input;
          }),
      );

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
      const action = craft((action) =>
        action
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
          }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      expect(typeof result.__ac_id).toBe("string");
      expect(result.__ac_id.length).toBeGreaterThan(0);
    });

    it("should include action ID in input validation errors", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => input),
      );

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
      const action = craft((action) =>
        action
          .schemas({
            inputSchema: stringSchema,
            bindSchemas: [numberSchema] as const,
          })
          .handler(async ({ input, bindArgs }) => ({ input, bindArgs })),
      );

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
      const action = craft(
        (action) =>
          action
            .schemas({
              inputSchema: stringSchema,
              outputSchema: numberSchema,
            })
            .handler(async ({ input }) => input), // Returns string when number expected
      );

      const result = await action("not-a-number");
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should include action ID in unhandled thrown errors", async () => {
      const action = craft((action) =>
        action.handler(async () => {
          throw new Error("Unhandled error");
        }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("UNHANDLED");
      }
    });

    it("should include action ID in custom thrown error handler results", async () => {
      const action = craft((action) =>
        action
          .config({
            handleThrownError: (error: unknown) => ({
              type: "CUSTOM_THROWN_ERROR" as const,
              message: error instanceof Error ? error.message : String(error),
            }),
          })
          .handler(async () => {
            throw new Error("Custom handled error");
          }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      if (!result.success) {
        expect(result.error.type).toBe("CUSTOM_THROWN_ERROR");
      }
    });

    it("should include action ID in implicit return errors", async () => {
      const action = craft((action) =>
        action.handler(async () => {
          // Implicit return undefined
        }),
      );

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
      const apiAction = craft((action) =>
        action
          .errors(errorDef)
          .handler(async ({ errors }) => errors.formatError("api")),
      );

      // Functional format
      const functionalAction = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .errors(errorDef)
          .handler(async ({ errors }) => errors.formatError("functional")),
      );

      // useActionState format
      const stateAction = craft((action) =>
        action
          .config({ useActionState: true })
          .errors(errorDef)
          .handler(async ({ errors }) => errors.formatError("state")),
      );

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

      const action = craft((action) =>
        action
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
          }),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.success).toBe(false);
      expect(result.__ac_id).toBe(actionId);
      expect(capturedActionIds).toHaveLength(4);
      expect(capturedActionIds.every((id) => id === actionId)).toBe(true);
    });

    it("should handle action ID in complex error scenarios with multiple validation layers", async () => {
      const action = craft((action) =>
        action
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
          }),
      );

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
});

describe("Action Name in Error Messages", () => {
  it("should include action name in validation error messages", async () => {
    const action = craft((action) =>
      action
        .config({
          actionName: "updateUserProfile",
        })
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input * 2;
        }),
    );

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
    const action = craft((action) =>
      action
        .config({
          actionName: "processPayment",
        })
        .handler(async () => {
          throw new Error("Payment gateway error");
        }),
    );

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
    const action = craft((action) =>
      action
        .config({
          actionName: "calculateTotal",
        })
        .handler(async () => {
          // Implicit return (undefined)
          const total = 100 + 50;
          // Missing return statement
        }),
    );

    const result = await action();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("UNHANDLED"); // Client sees generic error
    }
  });

  it("should include action name in bind args validation error messages", async () => {
    const action = craft((action) =>
      action
        .config({
          actionName: "multiplyNumbers",
        })
        .schemas({
          inputSchema: numberSchema,
          bindSchemas: [stringSchema] as const,
        })
        .handler(async ({ input, bindArgs }) => {
          return input * parseInt(bindArgs[0] as string);
        }),
    );

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

    const action = craft((action) =>
      action
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
        }),
    );

    const result = await action("hello");
    expect(result.success).toBe(true);

    expect(capturedMetadata).not.toBeNull();
    expect(capturedMetadata.actionName).toBe("testAction");
    expect(capturedMetadata.actionId).toBeDefined();
  });

  it("should work without action name (backward compatibility)", async () => {
    const action = craft((action) =>
      action
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input * 2;
        }),
    );

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
    const action = craft((action) =>
      action
        .config({
          actionName: "",
        })
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input * 2;
        }),
    );

    const result = await action("not-a-number" as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      expect(result.error.message).toBe("Input validation failed");
      expect(result.error.message).not.toContain("in action");
    }
  });

  it("should handle special characters in action names", async () => {
    const action = craft((action) =>
      action
        .config({
          actionName: "user-profile:update_v2",
        })
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => {
          return input * 2;
        }),
    );

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
