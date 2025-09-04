import { craft, initial } from "../../../src/index";
import { getActionId } from "../../../src/utils";
import {
  stringSchema,
  numberSchema,
  alwaysFailSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";
import { z } from "zod";

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
