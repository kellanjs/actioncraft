import {
  ActioncraftError,
  isActioncraftError,
} from "../../../src/classes/error";
import { craft, initial } from "../../../src/index";
import { getActionId } from "../../../src/utils";
import { unwrap, throwable } from "../../../src/utils";
import {
  stringSchema,
  numberSchema,
  userSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";
import { z } from "zod";

describe("utils - unwrap and throwable", () => {
  describe("unwrap function", () => {
    describe("success cases", () => {
      it("should unwrap api-style success results", async () => {
        const action = craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .handler(async ({ input }) => ({ message: `Hello ${input}` })),
        );

        const result = await action("World");
        const unwrapped = unwrap(result);

        expect(unwrapped).toEqual({ message: "Hello World" });
      });

      it("should unwrap functional-style success results", async () => {
        const action = craft((action) =>
          action
            .config({ resultFormat: "functional" })
            .schemas({ inputSchema: numberSchema })
            .handler(async ({ input }) => input * 2),
        );

        const result = await action(5);
        const unwrapped = unwrap(result);

        expect(unwrapped).toBe(10);
      });

      it("should preserve complex data types", async () => {
        const action = craft((action) =>
          action
            .schemas({ inputSchema: userSchema })
            .handler(async ({ input }) => ({
              user: { id: "123", ...input },
              metadata: { createdAt: new Date(), version: 1 },
            })),
        );

        const result = await action({
          name: "John Doe",
          email: "john@example.com",
          age: 25,
        });
        const unwrapped = unwrap(result);

        expect(unwrapped.user.id).toBe("123");
        expect(unwrapped.user.name).toBe("John Doe");
        expect(unwrapped.metadata.version).toBe(1);
        expect(unwrapped.metadata.createdAt).toBeInstanceOf(Date);
      });

      describe("promise variant and StatefulApiResult", () => {
        it("should unwrap api-style success results when passed a Promise", async () => {
          const action = craft((action) =>
            action
              .schemas({ inputSchema: stringSchema })
              .handler(async ({ input }) => (input as string).toUpperCase()),
          );

          // Pass the unresolved promise directly to unwrap
          const unwrapped = await unwrap(action("hello"));

          expect(unwrapped).toBe("HELLO");
        });

        it("should unwrap StatefulApiResult produced by useActionState", async () => {
          const action = craft((action) =>
            action
              .config({ useActionState: true })
              .schemas({ inputSchema: stringSchema })
              .handler(async ({ input }) => (input as string).toUpperCase()),
          );

          const result = await action(initial(action), "world");
          const unwrapped = unwrap(result);

          expect(unwrapped).toBe("WORLD");
        });
      });
    });

    describe("error cases", () => {
      it("should throw ActioncraftError for api-style error results", async () => {
        const action = craft((action) =>
          action
            .errors({
              customError: (message: string) =>
                ({ type: "CUSTOM_ERROR" as const, message }) as const,
            })
            .handler(async ({ errors }) =>
              errors.customError("Something went wrong"),
            ),
        );

        const result = await action();

        expect(() => unwrap(result)).toThrow(ActioncraftError);

        try {
          unwrap(result);
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("CUSTOM_ERROR");
            expect(error.cause.message).toBe("Something went wrong");
          }
        }
      });

      it("should throw ActioncraftError for functional-style error results", async () => {
        const action = craft((action) =>
          action
            .config({ resultFormat: "functional" })
            .errors({
              validationError: (field: string) =>
                ({ type: "VALIDATION_ERROR" as const, field }) as const,
            })
            .handler(async ({ errors }) => errors.validationError("email")),
        );

        const result = await action();

        expect(() => unwrap(result)).toThrow(ActioncraftError);

        try {
          unwrap(result);
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("VALIDATION_ERROR");
            expect(error.cause.field).toBe("email");
          }
        }
      });

      it("should handle input validation errors", async () => {
        const action = craft((action) =>
          action
            .schemas({
              inputSchema: z.object({
                email: z.string().email(),
                age: z.number().min(18),
              }),
            })
            .handler(async ({ input }) => input),
        );

        const result = await action({ email: "invalid-email", age: 16 });

        expect(() => unwrap(result)).toThrow(ActioncraftError);

        try {
          unwrap(result);
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("INPUT_VALIDATION");
          }
        }
      });

      it("should throw error for invalid result format", () => {
        const invalidResult = { invalid: "format" };

        expect(() => unwrap(invalidResult as any)).toThrow(
          "Invalid result format from Actioncraft action",
        );
      });
    });
  });

  describe("throwable function", () => {
    describe("success cases", () => {
      it("should return data directly from api-style actions", async () => {
        const action = craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .handler(async ({ input }) => ({ greeting: `Hello ${input}` })),
        );

        const throwableAction = throwable(action);
        const result = await throwableAction("World");

        expect(result).toEqual({ greeting: "Hello World" });
      });

      it("should return data directly from functional-style actions", async () => {
        const action = craft((action) =>
          action
            .config({ resultFormat: "functional" })
            .schemas({ inputSchema: numberSchema })
            .handler(async ({ input }) => Math.sqrt(input)),
        );

        const throwableAction = throwable(action);
        const result = await throwableAction(16);

        expect(result).toBe(4);
      });

      it("should preserve function signature", async () => {
        const action = craft((action) =>
          action
            .schemas({
              inputSchema: z.object({
                userId: z.string(),
                includeProfile: z.boolean(),
              }),
            })
            .handler(async ({ input }) => ({
              user: { id: input.userId, name: "John" },
              profile: input.includeProfile ? { bio: "Developer" } : null,
            })),
        );

        const throwableAction = throwable(action);
        const result = await throwableAction({
          userId: "123",
          includeProfile: true,
        });

        expect(result.user.id).toBe("123");
        expect(result.profile).toEqual({ bio: "Developer" });
      });

      it("should handle actions with no input", async () => {
        const action = craft((action) =>
          action.handler(async () => ({ timestamp: Date.now() })),
        );

        const throwableAction = throwable(action);
        const result = await throwableAction();

        expect(result).toHaveProperty("timestamp");
        expect(typeof result.timestamp).toBe("number");
      });
    });

    describe("error cases", () => {
      it("should throw ActioncraftError for custom errors", async () => {
        const action = craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .errors({
              notFound: (id: string) =>
                ({
                  type: "NOT_FOUND" as const,
                  id,
                  message: "Resource not found",
                }) as const,
              unauthorized: () =>
                ({
                  type: "UNAUTHORIZED" as const,
                  message: "Access denied",
                }) as const,
            })
            .handler(async ({ input, errors }) => {
              if (input === "missing") {
                return errors.notFound("user123");
              }
              if (input === "forbidden") {
                return errors.unauthorized();
              }
              return { data: input };
            }),
        );

        const throwableAction = throwable(action);

        // Test NOT_FOUND error
        await expect(throwableAction("missing")).rejects.toThrow(
          ActioncraftError,
        );

        try {
          await throwableAction("missing");
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("NOT_FOUND");
            expect(error.cause.id).toBe("user123");
          }
        }

        // Test UNAUTHORIZED error
        await expect(throwableAction("forbidden")).rejects.toThrow(
          ActioncraftError,
        );

        try {
          await throwableAction("forbidden");
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("UNAUTHORIZED");
            expect(error.cause.message).toBe("Access denied");
          }
        }
      });

      it("should throw ActioncraftError for validation errors", async () => {
        const action = craft((action) =>
          action
            .schemas({
              inputSchema: z.object({
                email: z.string().email("Invalid email"),
                age: z.number().min(18, "Must be at least 18"),
              }),
            })
            .handler(async ({ input }) => ({ user: input })),
        );

        const throwableAction = throwable(action);

        await expect(
          throwableAction({ email: "invalid", age: 16 }),
        ).rejects.toThrow(ActioncraftError);

        try {
          await throwableAction({ email: "invalid", age: 16 });
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("INPUT_VALIDATION");
          }
        }
      });

      it("should handle unhandled errors from handler implementations", async () => {
        const action = craft((action) =>
          action
            .schemas({ inputSchema: stringSchema })
            .handler(async ({ input }) => {
              if (input === "throw") {
                throw new Error("Unhandled error");
              }
              return { data: input };
            }),
        );

        const throwableAction = throwable(action);

        await expect(throwableAction("throw")).rejects.toThrow(
          ActioncraftError,
        );

        try {
          await throwableAction("throw");
        } catch (error) {
          expect(error).toBeInstanceOf(ActioncraftError);
          if (error instanceof ActioncraftError) {
            expect(error.cause.type).toBe("UNHANDLED");
          }
        }
      });
    });
  });

  describe("ActioncraftError class", () => {
    it("should create error with proper message and cause", () => {
      const errorData = {
        type: "NOT_FOUND" as const,
        id: "123",
        message: "Resource not found",
      };

      const error = new ActioncraftError(errorData, "test-action-id");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ActioncraftError);
      expect(error.name).toBe("ActioncraftError");
      expect(error.message).toBe(
        "Actioncraft Error: NOT_FOUND - Resource not found",
      );
      expect(error.cause).toEqual(errorData);
    });

    it("should create error without message field", () => {
      const errorData = {
        type: "UNAUTHORIZED" as const,
        code: 401,
      };

      const error = new ActioncraftError(errorData, "test-action-id");

      expect(error.message).toBe("Actioncraft Error: UNAUTHORIZED");
      expect(error.cause).toEqual(errorData);
    });

    it("should maintain proper prototype chain", () => {
      const errorData = { type: "CUSTOM_ERROR" as const };
      const error = new ActioncraftError(errorData, "test-action-id");

      expect(error instanceof ActioncraftError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isActioncraftError type guard", () => {
    it("should correctly identify ActioncraftError instances", async () => {
      const action = craft((action) =>
        action
          .errors({
            testError: () => ({ type: "TEST_ERROR" as const }),
          })
          .handler(async ({ errors }) => errors.testError()),
      );

      const throwableAction = throwable(action);
      let realActionError: unknown;

      // Generate a real ActioncraftError through action execution
      try {
        await throwableAction();
      } catch (error) {
        realActionError = error;
      }

      const regularError = new Error("Regular error");

      expect(isActioncraftError(realActionError, action)).toBe(true);
      expect(isActioncraftError(regularError, action)).toBe(false);
      expect(isActioncraftError(null, action)).toBe(false);
      expect(isActioncraftError(undefined, action)).toBe(false);
      expect(isActioncraftError("string", action)).toBe(false);
    });

    it("should enable type-safe error handling", async () => {
      const action = craft((action) =>
        action
          .errors({
            businessError: (code: string, details: Record<string, any>) =>
              ({ type: "BUSINESS_ERROR" as const, code, details }) as const,
          })
          .handler(async ({ errors }) => {
            return errors.businessError("INVALID_OPERATION", {
              reason: "test",
            });
          }),
      );

      const throwableAction = throwable(action);

      try {
        await throwableAction();
      } catch (error) {
        if (isActioncraftError(error, action)) {
          expect(error.cause.type).toBe("BUSINESS_ERROR");
          // Note: TypeScript may not narrow union types perfectly after type guard
          // but the runtime behavior works correctly
        }
      }
    });

    it("should validate ActioncraftError structure", async () => {
      const action = craft((action) =>
        action
          .errors({
            testError: () => ({ type: "TEST_ERROR" as const }),
          })
          .handler(async ({ errors }) => errors.testError()),
      );

      const throwableAction = throwable(action);
      let validError: unknown;

      // Generate a real ActioncraftError through action execution
      try {
        await throwableAction();
      } catch (error) {
        validError = error;
      }

      expect(isActioncraftError(validError, action)).toBe(true);

      // Test with manually created ActioncraftError-like objects to simulate
      // potential malformed errors (e.g., from serialization/deserialization)
      const malformedError1 = new Error("fake error") as any;
      malformedError1.name = "ActioncraftError";
      malformedError1.cause = null;
      expect(isActioncraftError(malformedError1, action)).toBe(false);

      const malformedError2 = new Error("fake error") as any;
      malformedError2.name = "ActioncraftError";
      malformedError2.cause = { type: 123 };
      expect(isActioncraftError(malformedError2, action)).toBe(false);

      const malformedError3 = new Error("fake error") as any;
      malformedError3.name = "ActioncraftError";
      malformedError3.cause = { type: "TEST_ERROR", message: 123 };
      expect(isActioncraftError(malformedError3, action)).toBe(false);

      // Valid message should pass
      // Test valid message through real action execution
      const validMessageAction = craft((action) =>
        action
          .errors({
            testError: (msg: string) => ({
              type: "TEST_ERROR" as const,
              message: msg,
            }),
          })
          .handler(async ({ errors }) => errors.testError("Valid message")),
      );

      const validThrowable = throwable(validMessageAction);
      let validMessageError: unknown;
      try {
        await validThrowable();
      } catch (error) {
        validMessageError = error;
      }
      expect(isActioncraftError(validMessageError, validMessageAction)).toBe(
        true,
      );

      // Undefined message should pass (it's optional)
      // Test undefined message through real action execution
      const undefinedMessageAction = craft((action) =>
        action
          .errors({
            testError: () => ({ type: "TEST_ERROR" as const }),
          })
          .handler(async ({ errors }) => errors.testError()),
      );

      const undefinedThrowable = throwable(undefinedMessageAction);
      let undefinedMessageError: unknown;
      try {
        await undefinedThrowable();
      } catch (error) {
        undefinedMessageError = error;
      }
      expect(
        isActioncraftError(undefinedMessageError, undefinedMessageAction),
      ).toBe(true);
    });

    it("should support verified error checking with action IDs", async () => {
      const actionA = craft((action) =>
        action
          .errors({
            errorA: () => ({ type: "ERROR_A" as const }),
          })
          .handler(async ({ errors }) => errors.errorA()),
      );

      const actionB = craft((action) =>
        action
          .errors({
            errorB: () => ({ type: "ERROR_B" as const }),
          })
          .handler(async ({ errors }) => errors.errorB()),
      );

      // Test throwable creates errors with action IDs
      const throwableA = throwable(actionA);
      const throwableB = throwable(actionB);

      let errorFromA: unknown;
      let errorFromB: unknown;

      try {
        await throwableA();
      } catch (error) {
        errorFromA = error;
      }

      try {
        await throwableB();
      } catch (error) {
        errorFromB = error;
      }

      // Import the verification functions
      const { isActioncraftError } = await import(
        "../../../src/classes/error.js"
      );
      const { getActionId } = await import("../../../src/utils.js");

      // Verify that errors can be correctly attributed to their actions
      expect(isActioncraftError(errorFromA, actionA)).toBe(true);
      expect(isActioncraftError(errorFromA, actionB)).toBe(false);

      expect(isActioncraftError(errorFromB, actionB)).toBe(true);
      expect(isActioncraftError(errorFromB, actionA)).toBe(false);

      // Verify action IDs are different
      const idA = getActionId(actionA);
      const idB = getActionId(actionB);
      expect(idA).toBeDefined();
      expect(idB).toBeDefined();
      expect(idA).not.toBe(idB);
    });
  });

  describe("Action ID preservation in utilities", () => {
    it("should preserve action ID when unwrapping successful results", async () => {
      const action = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .handler(async ({ input }) => ({ message: `Hello ${input}` })),
      );

      const result = await action("World");
      const actionId = getActionId(action);

      expect(result.__ac_id).toBe(actionId);

      // unwrap should not affect the original result's action ID
      const unwrapped = unwrap(result);
      expect(result.__ac_id).toBe(actionId);
      expect(unwrapped).toEqual({ message: "Hello World" });
    });

    it("should include action ID in ActioncraftError when unwrapping fails", async () => {
      const action = craft((action) =>
        action
          .errors({
            customError: (message: string) => ({
              type: "CUSTOM_ERROR" as const,
              message,
            }),
          })
          .handler(async ({ errors }) => errors.customError("Test error")),
      );

      const result = await action();
      const actionId = getActionId(action);

      expect(result.__ac_id).toBe(actionId);

      try {
        unwrap(result);
        expect.fail("Expected unwrap to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ActioncraftError);
        if (error instanceof ActioncraftError) {
          expect(error.actionId).toBe(actionId);
          expect(error.cause.type).toBe("CUSTOM_ERROR");
        }
      }
    });

    it("should include action ID in ActioncraftError from throwable functions", async () => {
      const action = craft((action) =>
        action
          .errors({
            throwableError: (code: number) => ({
              type: "THROWABLE_ERROR" as const,
              code,
            }),
          })
          .handler(async ({ errors }) => errors.throwableError(500)),
      );

      const throwableAction = throwable(action);
      const actionId = getActionId(action);

      try {
        await throwableAction();
        expect.fail("Expected throwable to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ActioncraftError);
        if (error instanceof ActioncraftError) {
          expect(error.actionId).toBe(actionId);
          expect(error.cause.type).toBe("THROWABLE_ERROR");
          expect(error.cause.code).toBe(500);
        }
      }
    });

    it("should handle action ID in different result formats with unwrap", async () => {
      // API format
      const apiAction = craft((action) =>
        action.handler(async () => "api-result"),
      );

      // Functional format
      const functionalAction = craft((action) =>
        action
          .config({ resultFormat: "functional" })
          .handler(async () => "functional-result"),
      );

      // useActionState format
      const stateAction = craft((action) =>
        action
          .config({ useActionState: true })
          .handler(async () => "state-result"),
      );

      const apiResult = await apiAction();
      const functionalResult = await functionalAction();
      const stateResult = await stateAction(initial(stateAction));

      const apiActionId = getActionId(apiAction);
      const functionalActionId = getActionId(functionalAction);
      const stateActionId = getActionId(stateAction);

      expect(apiResult.__ac_id).toBe(apiActionId);
      expect(functionalResult.__ac_id).toBe(functionalActionId);
      expect(stateResult.__ac_id).toBe(stateActionId);

      // All should unwrap successfully
      expect(unwrap(apiResult)).toBe("api-result");
      expect(unwrap(functionalResult)).toBe("functional-result");
      expect(unwrap(stateResult)).toBe("state-result");
    });

    it("should handle action ID verification in isActioncraftError with different actions", async () => {
      const action1 = craft((action) =>
        action
          .errors({
            error1: () => ({ type: "ERROR_1" as const }),
          })
          .handler(async ({ errors }) => errors.error1()),
      );

      const action2 = craft((action) =>
        action
          .errors({
            error2: () => ({ type: "ERROR_2" as const }),
          })
          .handler(async ({ errors }) => errors.error2()),
      );

      const throwable1 = throwable(action1);
      const throwable2 = throwable(action2);

      let error1: unknown;
      let error2: unknown;

      try {
        await throwable1();
      } catch (e) {
        error1 = e;
      }

      try {
        await throwable2();
      } catch (e) {
        error2 = e;
      }

      // Verify action ID verification works correctly
      expect(isActioncraftError(error1, action1)).toBe(true);
      expect(isActioncraftError(error1, action2)).toBe(false);
      expect(isActioncraftError(error2, action2)).toBe(true);
      expect(isActioncraftError(error2, action1)).toBe(false);

      // Verify action IDs are different
      const id1 = getActionId(action1);
      const id2 = getActionId(action2);
      expect(id1).not.toBe(id2);

      if (
        error1 instanceof ActioncraftError &&
        error2 instanceof ActioncraftError
      ) {
        expect(error1.actionId).toBe(id1);
        expect(error2.actionId).toBe(id2);
        expect(error1.actionId).not.toBe(error2.actionId);
      }
    });
  });

  describe("real-world integration patterns", () => {
    it("should work with React Query-style error handling", async () => {
      const updateUserAction = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              id: z.string(),
              name: z.string().min(2),
            }),
          })
          .errors({
            notFound: (id: string) =>
              ({
                type: "NOT_FOUND" as const,
                id,
                message: "User not found",
              }) as const,
            unauthorized: () =>
              ({
                type: "UNAUTHORIZED" as const,
                message: "Unauthorized",
              }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input.id === "404") {
              return errors.notFound(input.id);
            }
            if (input.id === "401") {
              return errors.unauthorized();
            }
            return { id: input.id, name: input.name, updatedAt: new Date() };
          }),
      );

      const mutationFn = throwable(updateUserAction);

      // Success case
      const result = await mutationFn({ id: "123", name: "John" });
      expect(result.id).toBe("123");
      expect(result.name).toBe("John");
      expect(result.updatedAt).toBeInstanceOf(Date);

      // Error handling helper (like you'd use in React Query)
      const handleError = (error: unknown) => {
        if (isActioncraftError(error, updateUserAction)) {
          switch (error.cause.type) {
            case "NOT_FOUND":
              return `User not found`;
            case "UNAUTHORIZED":
              return "You are not authorized to perform this action";
            case "INPUT_VALIDATION":
              return "Please check your input";
            default:
              return "An unexpected error occurred";
          }
        }
        return "Unknown error";
      };

      // Test error cases
      try {
        await mutationFn({ id: "404", name: "John" });
      } catch (error) {
        expect(handleError(error)).toBe("User not found");
      }

      try {
        await mutationFn({ id: "401", name: "John" });
      } catch (error) {
        expect(handleError(error)).toBe(
          "You are not authorized to perform this action",
        );
      }

      try {
        await mutationFn({ id: "123", name: "J" }); // Too short name
      } catch (error) {
        expect(handleError(error)).toBe("Please check your input");
      }
    });

    it("should work with useQuery patterns", async () => {
      const getWorkspaces = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({ profileId: z.string() }),
          })
          .errors({
            rateLimited: (retryAfter: number) =>
              ({ type: "RATE_LIMITED" as const, retryAfter }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input.profileId === "rate-limit") {
              return errors.rateLimited(60);
            }

            // Simulate API call
            const workspaces = [
              { id: "1", name: "Personal", profileId: input.profileId },
              { id: "2", name: "Work", profileId: input.profileId },
            ];
            return { workspaces };
          }),
      );

      // Pattern 1: Using throwable for React Query
      const queryFn = throwable(getWorkspaces);
      const result = await queryFn({ profileId: "123" });

      expect(result.workspaces).toHaveLength(2);
      expect(result.workspaces[0].profileId).toBe("123");

      // Pattern 2: Manual unwrapping
      const manualResult = await getWorkspaces({ profileId: "456" });
      const unwrapped = unwrap(manualResult);

      expect(unwrapped.workspaces).toHaveLength(2);
      expect(unwrapped.workspaces[0].profileId).toBe("456");

      // Error case
      await expect(queryFn({ profileId: "rate-limit" })).rejects.toThrow(
        ActioncraftError,
      );
    });

    it("should handle complex data fetching scenarios", async () => {
      const searchUsers = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              query: z.string().min(1),
              filters: z.object({
                role: z.enum(["admin", "user"]).optional(),
                active: z.boolean().optional(),
              }),
              pagination: z.object({
                page: z.number().min(1),
                limit: z.number().min(1).max(100),
              }),
            }),
          })
          .errors({
            rateLimited: (retryAfter: number) =>
              ({ type: "RATE_LIMITED" as const, retryAfter }) as const,
            invalidQuery: (reason: string) =>
              ({ type: "INVALID_QUERY" as const, reason }) as const,
          })
          .handler(async ({ input, errors }) => {
            if (input.query === "rate-limit") {
              return errors.rateLimited(60);
            }
            if (input.query.length < 2) {
              return errors.invalidQuery("Query too short");
            }

            // Simulate search results
            return {
              users: [
                { id: "1", name: "John", role: "admin" as const, active: true },
                { id: "2", name: "Jane", role: "user" as const, active: true },
              ],
              pagination: {
                page: input.pagination.page,
                limit: input.pagination.limit,
                total: 2,
                hasMore: false,
              },
              query: input.query,
            };
          }),
      );

      const searchFn = throwable(searchUsers);

      // Success case
      const result = await searchFn({
        query: "john",
        filters: { role: "admin", active: true },
        pagination: { page: 1, limit: 10 },
      });

      expect(result.users).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.query).toBe("john");

      // Error case
      await expect(
        searchFn({
          query: "rate-limit",
          filters: {},
          pagination: { page: 1, limit: 10 },
        }),
      ).rejects.toThrow(ActioncraftError);
    });
  });
});
