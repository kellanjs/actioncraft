import { actioncraft } from "../../../src/index";
import { stringSchema } from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Error Message Validation and Context Preservation", () => {
  describe("Error Message Structure and Content", () => {
    it("should validate error message format and content", async () => {
      const messageValidationAction = actioncraft()
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
        })
        .build();

      const result = await messageValidationAction("format-test");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("FORMATTED_ERROR");
        expect((result.error as any).code).toBe("E001");
        expect(result.error.message).toBe("Error E001: Test error message");
        expect((result.error as any).details).toBe("Test error message");
        expect((result.error as any).context.userId).toBe("user123");
        expect((result.error as any).timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );
      }
    });

    it("should validate error messages with internationalization support", async () => {
      const i18nMessages = {
        en: {
          VALIDATION_FAILED: "Validation failed for field {field}",
          UNAUTHORIZED_ACCESS: "Unauthorized access to resource {resource}",
          RATE_LIMIT_EXCEEDED:
            "Rate limit exceeded. Try again in {seconds} seconds",
        },
        es: {
          VALIDATION_FAILED: "La validación falló para el campo {field}",
          UNAUTHORIZED_ACCESS: "Acceso no autorizado al recurso {resource}",
          RATE_LIMIT_EXCEEDED:
            "Límite de velocidad excedido. Inténtalo de nuevo en {seconds} segundos",
        },
      };

      const i18nAction = actioncraft()
        .schemas({
          inputSchema: z.object({
            locale: z.enum(["en", "es"]),
            errorType: z.enum([
              "VALIDATION_FAILED",
              "UNAUTHORIZED_ACCESS",
              "RATE_LIMIT_EXCEEDED",
            ]),
            params: z.record(z.string(), z.string()),
          }),
        })
        .errors({
          localizedError: (
            messageKey: string,
            locale: string,
            params: Record<string, string>,
          ) => {
            const template =
              i18nMessages[locale as keyof typeof i18nMessages]?.[
                messageKey as keyof typeof i18nMessages.en
              ] || messageKey;
            const message = Object.entries(params).reduce(
              (msg, [key, value]) => msg.replace(`{${key}}`, value),
              template,
            );

            return {
              type: "LOCALIZED_ERROR" as const,
              messageKey,
              locale,
              message,
              params,
            };
          },
        })
        .handler(async ({ input, errors }) => {
          return errors.localizedError(
            input.errorType,
            input.locale,
            input.params,
          );
        })
        .build();

      // Test English localization
      const enResult = await i18nAction({
        locale: "en",
        errorType: "VALIDATION_FAILED",
        params: { field: "email" },
      });

      expect(enResult.success).toBe(false);
      if (!enResult.success) {
        expect(enResult.error.message).toBe(
          "Validation failed for field email",
        );
        expect((enResult.error as any).locale).toBe("en");
      }

      // Test Spanish localization
      const esResult = await i18nAction({
        locale: "es",
        errorType: "RATE_LIMIT_EXCEEDED",
        params: { seconds: "30" },
      });

      expect(esResult.success).toBe(false);
      if (!esResult.success) {
        expect(esResult.error.message).toBe(
          "Límite de velocidad excedido. Inténtalo de nuevo en 30 segundos",
        );
        expect((esResult.error as any).locale).toBe("es");
      }
    });

    it("should validate error message sanitization and security", async () => {
      const sanitizationAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          sanitizedError: (userInput: string) => {
            // Simulate sanitization of user input in error messages
            const sanitized = userInput
              .replace(/<script[^>]*>.*?<\/script>/gi, "[SCRIPT_REMOVED]")
              .replace(/javascript:void\(0\)/gi, "[JS_REMOVED]")
              .replace(/on\w+\s*=\w+\(\d+\)/gi, "[EVENT_REMOVED]");

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
        })
        .build();

      const maliciousInput =
        '<script>alert("xss")</script>javascript:void(0)onclick=alert(1)';
      const result = await sanitizationAction(maliciousInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("SANITIZED_ERROR");
        expect(result.error.message).toBe(
          "Invalid input: [SCRIPT_REMOVED][JS_REMOVED][EVENT_REMOVED]",
        );
        expect((result.error as any).containedScript).toBe(true);
        expect((result.error as any).sanitizedInput).not.toContain("<script>");
        expect((result.error as any).sanitizedInput).not.toContain(
          "javascript:",
        );
      }
    });
  });

  describe("Error Context Preservation", () => {
    it("should preserve request context across error boundaries", async () => {
      const contextAction = actioncraft()
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
        })
        .build();

      const testInput = {
        userId: "user123",
        requestId: "req-456",
        operation: "fail",
      };

      const result = await contextAction(testInput);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("CONTEXTUAL_ERROR");
        expect((result.error as any).operation).toBe("fail");
        expect((result.error as any).context.userId).toBe("user123");
        expect((result.error as any).context.requestId).toBe("req-456");
        expect((result.error as any).context.actionId).toBeDefined();
        expect((result.error as any).traceId).toMatch(/^trace-\d+$/);
      }
    });

    it("should preserve error context through nested action calls", async () => {
      const nestedContextAction: any = actioncraft()
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
        .handler(async ({ input, errors }): Promise<any> => {
          if (input === "level-1") {
            return errors.nestedError(1);
          }

          if (input === "level-2") {
            const level1Result: any = await nestedContextAction("level-1");
            if (!level1Result.success) {
              return errors.nestedError(2, level1Result.error);
            }
          }

          return "success";
        })
        .build();

      const result = await nestedContextAction("level-2");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("NESTED_ERROR");
        expect((result.error as any).level).toBe(2);
        expect((result.error as any).parentContext.type).toBe("NESTED_ERROR");
        expect((result.error as any).parentContext.level).toBe(1);
        expect((result.error as any).currentContext.level).toBe(2);
      }
    });

    it("should preserve error context in callback chains", async () => {
      const callbackContexts: any[] = [];

      const callbackContextAction = actioncraft()
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
              rawInput: "callback-fail", // We know the input from the test
            });
          },
          onError: async ({ error, metadata }) => {
            callbackContexts.push({
              phase: "error",
              actionId: metadata.actionId,
              actionName: metadata.actionName,
              errorType: error.type,
              rawInput: "callback-fail", // We know the input from the test
            });
          },
          onSettled: async ({ result, metadata }) => {
            callbackContexts.push({
              phase: "settled",
              actionId: metadata.actionId,
              actionName: metadata.actionName,
              success: result.success,
              rawInput: "callback-fail", // We know the input from the test
            });
          },
        })
        .build();

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
      expect(
        callbackContexts.every((ctx) => ctx.rawInput === "callback-fail"),
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

      const patternValidationAction = actioncraft()
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
        })
        .build();

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
      const maxMessageLength = 200;

      const messageLengthAction = actioncraft()
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
          const longMessage = input.repeat(100); // Create very long message
          return errors.truncatedError(longMessage);
        })
        .build();

      const result = await messageLengthAction(
        "This is a test message that will be repeated many times. ",
      );
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("TRUNCATED_ERROR");
        expect(result.error.message.length).toBeLessThanOrEqual(
          maxMessageLength,
        );
        expect(result.error.message.endsWith("...")).toBe(true);
        expect((result.error as any).truncated).toBe(true);
        expect((result.error as any).originalLength).toBeGreaterThan(
          maxMessageLength,
        );
      }
    });

    it("should validate error message encoding and special characters", async () => {
      const encodingAction = actioncraft()
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
        })
        .build();

      const specialInput = "Test with émojis 🚀 and spëcial chars: <>&\"'";
      const result = await encodingAction(specialInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("ENCODING_ERROR");
        expect(result.error.message).toContain(specialInput);
        expect((result.error as any).hasSpecialChars).toBe(true);
        expect((result.error as any).hasUnicode).toBe(true);
        expect((result.error as any).encodedInput).toBe(
          encodeURIComponent(specialInput),
        );
      }
    });
  });

  describe("Error Context Serialization", () => {
    it("should handle complex object serialization in error context", async () => {
      const serializationAction = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .errors({
          serializationError: (complexObject: any) => {
            // Test serialization of complex objects with circular reference handling
            const seen = new WeakSet();
            const serialized = JSON.stringify(complexObject, (key, value) => {
              if (typeof value === "function") return "[Function]";
              if (value instanceof Date) return value.toISOString();
              if (value instanceof Error)
                return { name: value.name, message: value.message };
              if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                  return "[Circular Reference]";
                }
                seen.add(value);
              }
              return value;
            });

            return {
              type: "SERIALIZATION_ERROR" as const,
              message: "Complex object serialization test",
              originalObject: complexObject,
              serializedObject: serialized,
              serializationSuccess: true,
            };
          },
        })
        .handler(async ({ input, errors }) => {
          const complexObject = {
            date: new Date(),
            error: new Error("Test error"),
            function: () => "test",
            nested: {
              array: [1, 2, 3],
              null: null,
              undefined: undefined,
            },
            circular: {} as any,
          };

          // Create circular reference
          complexObject.circular.self = complexObject;

          return errors.serializationError(complexObject);
        })
        .build();

      const result = await serializationAction("test");
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.type).toBe("SERIALIZATION_ERROR");
        expect((result.error as any).serializationSuccess).toBe(true);
        expect(typeof (result.error as any).serializedObject).toBe("string");
      }
    });
  });
});
