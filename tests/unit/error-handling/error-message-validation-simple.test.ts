import { craft } from "../../../src/index";
import { stringSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";
import { z } from "zod";

describe("Error Message Validation and Context Preservation (Simplified)", () => {
  describe("Error Message Structure and Content", () => {
    it("should validate error message format and content", async () => {
      const messageValidationAction = craft((action) =>
        action
          .config({ actionName: "messageValidationTest" })
          .schemas({ inputSchema: stringSchema })
          .errors({
            formattedError: (
              code: string,
              details: string,
              context?: Record<string, any>,
            ) => ({
              type: "FORMATTED_ERROR" as const,
              code,
              message: `Error ${code}: ${details}`,
              details,
              context: context || {},
              timestamp: new Date().toISOString(),
            }),
          })
          .handler(async ({ input, errors }) => {
            if (input === "format-test") {
              return errors.formattedError("E001", "Test error message", {
                userId: "user123",
                operation: "test",
              });
            }
            return "success";
          }),
      );

      const result = await messageValidationAction("format-test");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("FORMATTED_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.code).toBe("E001");
        expect(result.error.message).toBe("Error E001: Test error message");
        // @ts-expect-error - Testing error structure
        expect(result.error.details).toBe("Test error message");
        // @ts-expect-error - Testing error structure
        expect(result.error.context.userId).toBe("user123");
        // @ts-expect-error - Testing error structure
        expect(result.error.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );
      }
    });

    it("should validate error messages with localization", async () => {
      const i18nAction = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              locale: z.enum(["en", "es"]),
              field: z.string(),
            }),
          })
          .errors({
            localizedError: (locale: string, field: string) => {
              const messages = {
                en: `Validation failed for field ${field}`,
                es: `La validación falló para el campo ${field}`,
              };

              return {
                type: "LOCALIZED_ERROR" as const,
                locale,
                message:
                  messages[locale as keyof typeof messages] ||
                  `Error for ${field}`,
                field,
              };
            },
          })
          .handler(async ({ input, errors }) => {
            return errors.localizedError(input.locale, input.field);
          }),
      );

      // Test English localization
      const enResult = await i18nAction({
        locale: "en",
        field: "email",
      });

      expect(enResult.success).toBe(false);
      if (!enResult.success) {
        expect(enResult.error.type).toBe("LOCALIZED_ERROR");
        expect(enResult.error.message).toBe(
          "Validation failed for field email",
        );
        // @ts-expect-error - Testing error structure
        expect(enResult.error.locale).toBe("en");
      }
    });

    it("should validate error message sanitization", async () => {
      const sanitizationAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            sanitizedError: (userInput: string) => {
              // Simple sanitization for testing
              const sanitized = userInput
                .replace(/<script>/gi, "[SCRIPT_REMOVED]")
                .replace(/javascript:/gi, "[JS_REMOVED]");

              return {
                type: "SANITIZED_ERROR" as const,
                message: `Invalid input: ${sanitized}`,
                originalInput: userInput,
                sanitizedInput: sanitized,
                containedScript: userInput !== sanitized,
              };
            },
          })
          .handler(async ({ input, errors }) => {
            if (input.includes("<script>") || input.includes("javascript:")) {
              return errors.sanitizedError(input);
            }
            return "safe input";
          }),
      );

      const maliciousInput = '<script>alert("xss")</script>javascript:void(0)';
      const result = await sanitizationAction(maliciousInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("SANITIZED_ERROR");
        expect(result.error.message).toContain("[SCRIPT_REMOVED]");
        expect(result.error.message).toContain("[JS_REMOVED]");
        // @ts-expect-error - Testing error structure
        expect(result.error.containedScript).toBe(true);
        // @ts-expect-error - Testing error structure
        expect(result.error.sanitizedInput).not.toContain("<script>");
        // @ts-expect-error - Testing error structure
        expect(result.error.sanitizedInput).not.toContain("javascript:");
      }
    });
  });

  describe("Error Context Preservation", () => {
    it("should preserve request context across error boundaries", async () => {
      const contextAction = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              userId: z.string(),
              requestId: z.string(),
              operation: z.string(),
            }),
          })
          .errors({
            contextualError: (
              operation: string,
              context: Record<string, any>,
            ) => ({
              type: "CONTEXTUAL_ERROR" as const,
              operation,
              context,
              timestamp: Date.now(),
              traceId: `trace-${Date.now()}`,
            }),
          })
          .handler(async ({ input, errors, metadata }) => {
            const requestContext = {
              userId: input.userId,
              requestId: input.requestId,
              actionId: metadata.actionId,
              actionName: metadata.actionName,
              timestamp: Date.now(),
            };

            if (input.operation === "fail") {
              return errors.contextualError(input.operation, requestContext);
            }

            return { success: true, context: requestContext };
          }),
      );

      const testInput = {
        userId: "user123",
        requestId: "req-456",
        operation: "fail",
      };

      const result = await contextAction(testInput);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("CONTEXTUAL_ERROR");
        // @ts-expect-error - Testing error structure
        expect(result.error.operation).toBe("fail");
        // @ts-expect-error - Testing error structure
        expect(result.error.context.userId).toBe("user123");
        // @ts-expect-error - Testing error structure
        expect(result.error.context.requestId).toBe("req-456");
        // @ts-expect-error - Testing error structure
        expect(result.error.context.actionId).toBeDefined();
        // @ts-expect-error - Testing error structure
        expect(result.error.traceId).toMatch(/^trace-\d+$/);
      }
    });

    it("should preserve error context through nested action calls", async () => {
      const nestedContextAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            nestedError: (level: number, parentContext?: any) => ({
              type: "NESTED_ERROR" as const,
              level,
              parentContext,
              currentContext: {
                timestamp: Date.now(),
                level,
              },
            }),
          })
          .handler(async ({ input, errors }) => {
            if (input === "level-1") {
              return errors.nestedError(1);
            }

            if (input === "level-2") {
              const level1Result = await nestedContextAction("level-1");
              if (!level1Result.success) {
                return errors.nestedError(2, level1Result.error);
              }
            }

            return "success";
          }),
      );

      const result = await nestedContextAction("level-2");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("NESTED_ERROR");
        expect(result.error.level).toBe(2);
        expect(result.error.parentContext.type).toBe("NESTED_ERROR");
        expect(result.error.parentContext.level).toBe(1);
        expect(result.error.currentContext.level).toBe(2);
      }
    });

    it("should preserve error context in callback chains", async () => {
      const callbackContexts: any[] = [];

      const callbackContextAction = craft((action) =>
        action
          .config({ actionName: "callbackContextTest" })
          .schemas({ inputSchema: stringSchema })
          .errors({
            callbackError: (phase: string, context: Record<string, any>) => ({
              type: "CALLBACK_ERROR" as const,
              phase,
              context,
            }),
          })
          .handler(async ({ input, errors, metadata }) => {
            if (input === "callback-fail") {
              return errors.callbackError("handler", {
                actionId: metadata.actionId,
                actionName: metadata.actionName,
                input,
              });
            }
            return "success";
          })
          .callbacks({
            onStart: async ({ metadata }) => {
              callbackContexts.push({
                phase: "start",
                actionId: metadata.actionId,
                actionName: metadata.actionName,
              });
            },
            onError: async ({ error, metadata }) => {
              callbackContexts.push({
                phase: "error",
                actionId: metadata.actionId,
                actionName: metadata.actionName,
                errorType: error.type,
              });
            },
            onSettled: async ({ result, metadata }) => {
              callbackContexts.push({
                phase: "settled",
                actionId: metadata.actionId,
                actionName: metadata.actionName,
                success: result.success,
              });
            },
          }),
      );

      const result = await callbackContextAction("callback-fail");
      expect(result.success).toBe(false);

      // Verify context preservation across all callbacks
      expect(callbackContexts).toHaveLength(3);

      const actionId = callbackContexts[0].actionId;
      expect(callbackContexts.every((ctx) => ctx.actionId === actionId)).toBe(
        true,
      );
      expect(
        callbackContexts.every(
          (ctx) => ctx.actionName === "callbackContextTest",
        ),
      ).toBe(true);

      expect(callbackContexts[0].phase).toBe("start");
      expect(callbackContexts[1].phase).toBe("error");
      expect(callbackContexts[1].errorType).toBe("CALLBACK_ERROR");
      expect(callbackContexts[2].phase).toBe("settled");
      expect(callbackContexts[2].success).toBe(false);
    });
  });

  describe("Error Message Validation Patterns", () => {
    it("should validate error messages against predefined patterns", async () => {
      const errorPatterns = {
        VALIDATION_ERROR: /^Validation failed: .+$/,
        BUSINESS_ERROR: /^Business rule violation: .+ \(code: \w+\)$/,
        SYSTEM_ERROR:
          /^System error: .+ at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      };

      const patternValidationAction = craft((action) =>
        action
          .schemas({
            inputSchema: z.object({
              errorType: z.enum([
                "VALIDATION_ERROR",
                "BUSINESS_ERROR",
                "SYSTEM_ERROR",
              ]),
              details: z.string(),
            }),
          })
          .errors({
            validationError: (details: string) => ({
              type: "VALIDATION_ERROR" as const,
              message: `Validation failed: ${details}`,
            }),
            businessError: (details: string, code: string) => ({
              type: "BUSINESS_ERROR" as const,
              message: `Business rule violation: ${details} (code: ${code})`,
            }),
            systemError: (details: string) => ({
              type: "SYSTEM_ERROR" as const,
              message: `System error: ${details} at ${new Date().toISOString()}`,
            }),
          })
          .handler(async ({ input, errors }) => {
            switch (input.errorType) {
              case "VALIDATION_ERROR":
                return errors.validationError(input.details);
              case "BUSINESS_ERROR":
                return errors.businessError(input.details, "BR001");
              case "SYSTEM_ERROR":
                return errors.systemError(input.details);
              default:
                return "success";
            }
          }),
      );

      // Test validation error pattern
      const validationResult = await patternValidationAction({
        errorType: "VALIDATION_ERROR",
        details: "Email format is invalid",
      });

      expect(validationResult.success).toBe(false);
      if (!validationResult.success) {
        expect(validationResult.error.message).toMatch(
          errorPatterns.VALIDATION_ERROR,
        );
      }

      // Test business error pattern
      const businessResult = await patternValidationAction({
        errorType: "BUSINESS_ERROR",
        details: "Insufficient funds",
      });

      expect(businessResult.success).toBe(false);
      if (!businessResult.success) {
        expect(businessResult.error.message).toMatch(
          errorPatterns.BUSINESS_ERROR,
        );
      }

      // Test system error pattern
      const systemResult = await patternValidationAction({
        errorType: "SYSTEM_ERROR",
        details: "Database connection failed",
      });

      expect(systemResult.success).toBe(false);
      if (!systemResult.success) {
        expect(systemResult.error.message).toMatch(errorPatterns.SYSTEM_ERROR);
      }
    });

    it("should validate error message length and truncation", async () => {
      const maxMessageLength = 50;

      const messageLengthAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            truncatedError: (longMessage: string) => {
              const truncated =
                longMessage.length > maxMessageLength
                  ? `${longMessage.substring(0, maxMessageLength - 3)}...`
                  : longMessage;

              return {
                type: "TRUNCATED_ERROR" as const,
                message: truncated,
                originalLength: longMessage.length,
                truncated: longMessage.length > maxMessageLength,
              };
            },
          })
          .handler(async ({ input, errors }) => {
            const longMessage = input.repeat(20); // Create long message
            return errors.truncatedError(longMessage);
          }),
      );

      const result = await messageLengthAction("This is a test message. ");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("TRUNCATED_ERROR");
        expect(result.error.message.length).toBeLessThanOrEqual(
          maxMessageLength,
        );
        expect(result.error.message.endsWith("...")).toBe(true);
        // @ts-expect-error - Testing error structure
        expect(result.error.truncated).toBe(true);
        // @ts-expect-error - Testing error structure
        expect(result.error.originalLength).toBeGreaterThan(maxMessageLength);
      }
    });

    it("should validate error message encoding and special characters", async () => {
      const encodingAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            encodingError: (input: string) => ({
              type: "ENCODING_ERROR" as const,
              message: `Invalid characters in input: ${input}`,
              originalInput: input,
              encodedInput: encodeURIComponent(input),
              hasSpecialChars: /[^\w\s]/.test(input),
              hasUnicode: /[^\x00-\x7F]/.test(input),
            }),
          })
          .handler(async ({ input, errors }) => {
            return errors.encodingError(input);
          }),
      );

      const specialInput = "Test with émojis 🚀 and spëcial chars: <>&\"'";
      const result = await encodingAction(specialInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("ENCODING_ERROR");
        expect(result.error.message).toContain(specialInput);
        // @ts-expect-error - Testing error structure
        expect(result.error.hasSpecialChars).toBe(true);
        // @ts-expect-error - Testing error structure
        expect(result.error.hasUnicode).toBe(true);
        // @ts-expect-error - Testing error structure
        expect(result.error.encodedInput).toBe(
          encodeURIComponent(specialInput),
        );
      }
    });
  });

  describe("Error Context Serialization", () => {
    it("should handle object serialization in error context", async () => {
      const serializationAction = craft((action) =>
        action
          .schemas({ inputSchema: stringSchema })
          .errors({
            serializationError: (data: any) => ({
              type: "SERIALIZATION_ERROR" as const,
              message: "Object serialization test",
              data,
              serialized: JSON.stringify(data),
            }),
          })
          .handler(async ({ errors }) => {
            const testObject = {
              date: new Date().toISOString(),
              number: 42,
              string: "test",
              nested: {
                array: [1, 2, 3],
                boolean: true,
              },
            };

            return errors.serializationError(testObject);
          }),
      );

      const result = await serializationAction("test");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("SERIALIZATION_ERROR");
        // @ts-expect-error - Testing error structure
        expect(typeof result.error.serialized).toBe("string");
        // @ts-expect-error - Testing error structure
        expect(result.error.data.number).toBe(42);
        // @ts-expect-error - Testing error structure
        expect(result.error.data.nested.array).toEqual([1, 2, 3]);
      }
    });
  });
});
