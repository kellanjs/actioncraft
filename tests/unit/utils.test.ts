import { create, initial } from "../../src/actioncraft";
import { ActionCraftError, isActionCraftError } from "../../src/error";
import { unwrap, throwable } from "../../src/utils";
import { stringSchema, numberSchema, userSchema } from "../fixtures/schemas";
import { describe, it, expect } from "../setup";
import { z } from "zod/v4";

describe("utils - unwrap and throwable", () => {
  describe("unwrap function", () => {
    describe("success cases", () => {
      it("should unwrap api-style success results", async () => {
        const action = create()
          .schemas({ inputSchema: stringSchema })
          .action(async ({ input }) => ({ message: `Hello ${input}` }))
          .craft();

        const result = await action("World");
        const unwrapped = unwrap(result);

        expect(unwrapped).toEqual({ message: "Hello World" });
      });

      it("should unwrap functional-style success results", async () => {
        const action = create({ resultFormat: "functional" })
          .schemas({ inputSchema: numberSchema })
          .action(async ({ input }) => input * 2)
          .craft();

        const result = await action(5);
        const unwrapped = unwrap(result);

        expect(unwrapped).toBe(10);
      });

      it("should preserve complex data types", async () => {
        const action = create()
          .schemas({ inputSchema: userSchema })
          .action(async ({ input }) => ({
            user: { id: "123", ...input },
            metadata: { createdAt: new Date(), version: 1 },
          }))
          .craft();

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
          const action = create()
            .schemas({ inputSchema: stringSchema })
            .action(async ({ input }) => (input as string).toUpperCase())
            .craft();

          // Pass the unresolved promise directly to unwrap
          const unwrapped = await unwrap(action("hello"));

          expect(unwrapped).toBe("HELLO");
        });

        it("should unwrap StatefulApiResult produced by useActionState", async () => {
          const action = create({ useActionState: true })
            .schemas({ inputSchema: stringSchema })
            .action(async ({ input }) => (input as string).toUpperCase())
            .craft();

          const result = await action(initial(action), "world");
          const unwrapped = unwrap(result);

          expect(unwrapped).toBe("WORLD");
        });
      });
    });

    describe("error cases", () => {
      it("should throw ActionCraftError for api-style error results", async () => {
        const action = create()
          .errors({
            customError: (message: string) =>
              ({ type: "CUSTOM_ERROR" as const, message }) as const,
          })
          .action(async ({ errors }) =>
            errors.customError("Something went wrong"),
          )
          .craft();

        const result = await action();

        expect(() => unwrap(result)).toThrow(ActionCraftError);

        try {
          unwrap(result);
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("CUSTOM_ERROR");
            expect(error.cause.message).toBe("Something went wrong");
          }
        }
      });

      it("should throw ActionCraftError for functional-style error results", async () => {
        const action = create({ resultFormat: "functional" })
          .errors({
            validationError: (field: string) =>
              ({ type: "VALIDATION_ERROR" as const, field }) as const,
          })
          .action(async ({ errors }) => errors.validationError("email"))
          .craft();

        const result = await action();

        expect(() => unwrap(result)).toThrow(ActionCraftError);

        try {
          unwrap(result);
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("VALIDATION_ERROR");
            expect(error.cause.field).toBe("email");
          }
        }
      });

      it("should handle input validation errors", async () => {
        const action = create()
          .schemas({
            inputSchema: z.object({
              email: z.string().email(),
              age: z.number().min(18),
            }),
          })
          .action(async ({ input }) => input)
          .craft();

        const result = await action({ email: "invalid-email", age: 16 });

        expect(() => unwrap(result)).toThrow(ActionCraftError);

        try {
          unwrap(result);
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("INPUT_VALIDATION");
          }
        }
      });

      it("should throw error for invalid result format", () => {
        const invalidResult = { invalid: "format" };

        expect(() => unwrap(invalidResult as any)).toThrow(
          "Invalid result format from ActionCraft action",
        );
      });
    });
  });

  describe("throwable function", () => {
    describe("success cases", () => {
      it("should return data directly from api-style actions", async () => {
        const action = create()
          .schemas({ inputSchema: stringSchema })
          .action(async ({ input }) => ({ greeting: `Hello ${input}` }))
          .craft();

        const throwableAction = throwable(action);
        const result = await throwableAction("World");

        expect(result).toEqual({ greeting: "Hello World" });
      });

      it("should return data directly from functional-style actions", async () => {
        const action = create({ resultFormat: "functional" })
          .schemas({ inputSchema: numberSchema })
          .action(async ({ input }) => Math.sqrt(input))
          .craft();

        const throwableAction = throwable(action);
        const result = await throwableAction(16);

        expect(result).toBe(4);
      });

      it("should preserve function signature", async () => {
        const action = create()
          .schemas({
            inputSchema: z.object({
              userId: z.string(),
              includeProfile: z.boolean(),
            }),
          })
          .action(async ({ input }) => ({
            user: { id: input.userId, name: "John" },
            profile: input.includeProfile ? { bio: "Developer" } : null,
          }))
          .craft();

        const throwableAction = throwable(action);
        const result = await throwableAction({
          userId: "123",
          includeProfile: true,
        });

        expect(result.user.id).toBe("123");
        expect(result.profile).toEqual({ bio: "Developer" });
      });

      it("should handle actions with no input", async () => {
        const action = create()
          .action(async () => ({ timestamp: Date.now() }))
          .craft();

        const throwableAction = throwable(action);
        const result = await throwableAction();

        expect(result).toHaveProperty("timestamp");
        expect(typeof result.timestamp).toBe("number");
      });
    });

    describe("error cases", () => {
      it("should throw ActionCraftError for custom errors", async () => {
        const action = create()
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
          .action(async ({ input, errors }) => {
            if (input === "missing") {
              return errors.notFound("user123");
            }
            if (input === "forbidden") {
              return errors.unauthorized();
            }
            return { data: input };
          })
          .craft();

        const throwableAction = throwable(action);

        // Test NOT_FOUND error
        await expect(throwableAction("missing")).rejects.toThrow(
          ActionCraftError,
        );

        try {
          await throwableAction("missing");
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("NOT_FOUND");
            expect(error.cause.id).toBe("user123");
          }
        }

        // Test UNAUTHORIZED error
        await expect(throwableAction("forbidden")).rejects.toThrow(
          ActionCraftError,
        );

        try {
          await throwableAction("forbidden");
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("UNAUTHORIZED");
            expect(error.cause.message).toBe("Access denied");
          }
        }
      });

      it("should throw ActionCraftError for validation errors", async () => {
        const action = create()
          .schemas({
            inputSchema: z.object({
              email: z.string().email("Invalid email"),
              age: z.number().min(18, "Must be at least 18"),
            }),
          })
          .action(async ({ input }) => ({ user: input }))
          .craft();

        const throwableAction = throwable(action);

        await expect(
          throwableAction({ email: "invalid", age: 16 }),
        ).rejects.toThrow(ActionCraftError);

        try {
          await throwableAction({ email: "invalid", age: 16 });
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("INPUT_VALIDATION");
          }
        }
      });

      it("should handle unhandled errors from action implementations", async () => {
        const action = create()
          .schemas({ inputSchema: stringSchema })
          .action(async ({ input }) => {
            if (input === "throw") {
              throw new Error("Unhandled error");
            }
            return { data: input };
          })
          .craft();

        const throwableAction = throwable(action);

        await expect(throwableAction("throw")).rejects.toThrow(
          ActionCraftError,
        );

        try {
          await throwableAction("throw");
        } catch (error) {
          expect(error).toBeInstanceOf(ActionCraftError);
          if (error instanceof ActionCraftError) {
            expect(error.cause.type).toBe("UNHANDLED");
          }
        }
      });
    });
  });

  describe("ActionCraftError class", () => {
    it("should create error with proper message and cause", () => {
      const errorData = {
        type: "NOT_FOUND" as const,
        id: "123",
        message: "Resource not found",
      };

      const error = new ActionCraftError(errorData);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ActionCraftError);
      expect(error.name).toBe("ActionCraftError");
      expect(error.message).toBe(
        "ActionCraft Error: NOT_FOUND - Resource not found",
      );
      expect(error.cause).toEqual(errorData);
    });

    it("should create error without message field", () => {
      const errorData = {
        type: "UNAUTHORIZED" as const,
        code: 401,
      };

      const error = new ActionCraftError(errorData);

      expect(error.message).toBe("ActionCraft Error: UNAUTHORIZED");
      expect(error.cause).toEqual(errorData);
    });

    it("should maintain proper prototype chain", () => {
      const errorData = { type: "CUSTOM_ERROR" as const };
      const error = new ActionCraftError(errorData);

      expect(error instanceof ActionCraftError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isActionCraftError type guard", () => {
    it("should correctly identify ActionCraftError instances", () => {
      const action = create()
        .errors({
          testError: () => ({ type: "TEST_ERROR" as const }),
        })
        .action(async ({ errors }) => errors.testError())
        .craft();

      const errorData = { type: "TEST_ERROR" as const };
      const actionError = new ActionCraftError(errorData);
      const regularError = new Error("Regular error");

      expect(isActionCraftError(actionError, action)).toBe(true);
      expect(isActionCraftError(regularError, action)).toBe(false);
      expect(isActionCraftError(null, action)).toBe(false);
      expect(isActionCraftError(undefined, action)).toBe(false);
      expect(isActionCraftError("string", action)).toBe(false);
    });

    it("should enable type-safe error handling", async () => {
      const action = create()
        .errors({
          businessError: (code: string, details: Record<string, any>) =>
            ({ type: "BUSINESS_ERROR" as const, code, details }) as const,
        })
        .action(async ({ errors }) => {
          return errors.businessError("INVALID_OPERATION", { reason: "test" });
        })
        .craft();

      const throwableAction = throwable(action);

      try {
        await throwableAction();
      } catch (error) {
        if (isActionCraftError(error, action)) {
          expect(error.cause.type).toBe("BUSINESS_ERROR");
          // Note: TypeScript may not narrow union types perfectly after type guard
          // but the runtime behavior works correctly
        }
      }
    });
  });

  describe("real-world integration patterns", () => {
    it("should work with React Query-style error handling", async () => {
      const updateUserAction = create()
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
        .action(async ({ input, errors }) => {
          if (input.id === "404") {
            return errors.notFound(input.id);
          }
          if (input.id === "401") {
            return errors.unauthorized();
          }
          return { id: input.id, name: input.name, updatedAt: new Date() };
        })
        .craft();

      const mutationFn = throwable(updateUserAction);

      // Success case
      const result = await mutationFn({ id: "123", name: "John" });
      expect(result.id).toBe("123");
      expect(result.name).toBe("John");
      expect(result.updatedAt).toBeInstanceOf(Date);

      // Error handling helper (like you'd use in React Query)
      const handleError = (error: unknown) => {
        if (isActionCraftError(error, updateUserAction)) {
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
      const getWorkspaces = create()
        .schemas({
          inputSchema: z.object({ profileId: z.string() }),
        })
        .errors({
          rateLimited: (retryAfter: number) =>
            ({ type: "RATE_LIMITED" as const, retryAfter }) as const,
        })
        .action(async ({ input, errors }) => {
          if (input.profileId === "rate-limit") {
            return errors.rateLimited(60);
          }

          // Simulate API call
          const workspaces = [
            { id: "1", name: "Personal", profileId: input.profileId },
            { id: "2", name: "Work", profileId: input.profileId },
          ];
          return { workspaces };
        })
        .craft();

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
        ActionCraftError,
      );
    });

    it("should handle complex data fetching scenarios", async () => {
      const searchUsers = create()
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
        .action(async ({ input, errors }) => {
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
        })
        .craft();

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
      ).rejects.toThrow(ActionCraftError);
    });
  });
});
