import { craft, initial } from "../../src/index";
import { isOk } from "../../src/types/result";
import { describe, expect, it } from "../setup";
import { z } from "zod";
import { zfd } from "zod-form-data";

describe("InferSerializedValues Scenarios", () => {
  const userSchema = z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number().min(18),
  });

  const userFormDataSchema = zfd.formData({
    name: zfd.text(),
    email: zfd.text(),
    age: zfd.numeric(),
  });

  describe("Scenario 1: With inputSchema provided", () => {
    it("should return schema input type for better IntelliSense", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const userInput = {
        name: "Jane",
        email: "jane@example.com",
        age: 30,
      };

      const result = await action(initial(action), userInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Hello Jane!");
        // values should be the schema input type for better IntelliSense
        expect(result.values).toEqual(userInput);
        // Should have proper typing for the schema fields
        expect(result.values?.name).toBe("Jane");
        expect(result.values?.email).toBe("jane@example.com");
        expect(result.values?.age).toBe(30);
      }
    });

    it("should handle primitive types from schema", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: z.string() })
          .handler(async ({ input }) => {
            return input.toUpperCase();
          }),
      );

      const result = await action(initial(action), "hello");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("HELLO");
        // values should be the raw string input
        expect(result.values).toBe("hello");
        expect(typeof result.values).toBe("string");
      }
    });

    it("should handle FormData with schema", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userFormDataSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const formData = new FormData();
      formData.append("name", "John");
      formData.append("email", "john@example.com");
      formData.append("age", "25");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Hello John!");
        // values should be the schema input type for better IntelliSense
        expect(result.values).toEqual({
          name: "John",
          email: "john@example.com",
          age: 25, // FormData schema converts string to number
        });
      }
    });
  });

  describe("Scenario 2: Without inputSchema", () => {
    it("should handle FormData without schema", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata: _metadata }) => {
            // Should handle FormData as raw input
            expect(_metadata.rawInput).toBeInstanceOf(FormData);
            return "form processed";
          }),
      );

      const formData = new FormData();
      formData.append("name", "Bob");
      formData.append("email", "bob@example.com");
      formData.append("preferences", "dark");
      formData.append("preferences", "compact");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("form processed");
        // values should be unknown without schema
        expect(result.values).toEqual({
          name: "Bob",
          email: "bob@example.com",
          preferences: ["dark", "compact"],
        });
      }
    });

    it("should handle empty FormData", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "empty form processed";
          }),
      );

      const formData = new FormData();

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("empty form processed");
        // values should be empty object for empty FormData
        expect(result.values).toEqual({});
      }
    });
  });

  describe("FormData File Handling", () => {
    it("should handle File objects by storing filename", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "file processed";
          }),
      );

      const formData = new FormData();
      const file = new File(["content"], "test.txt", { type: "text/plain" });
      formData.append("document", file);
      formData.append("name", "John");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("file processed");
        expect(result.values).toEqual({
          document: "test.txt", // File objects store filename
          name: "John",
        });
      }
    });

    it("should handle File objects without name", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "file processed";
          }),
      );

      const formData = new FormData();
      // Create a File without a name (empty string)
      const file = new File(["content"], "", { type: "text/plain" });
      formData.append("document", file);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("file processed");
        expect(result.values).toEqual({
          document: "[File]", // Fallback for files without names
        });
      }
    });

    it("should handle multiple files with same key", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "files processed";
          }),
      );

      const formData = new FormData();
      const file1 = new File(["content1"], "file1.txt", { type: "text/plain" });
      const file2 = new File(["content2"], "file2.txt", { type: "text/plain" });
      formData.append("documents", file1);
      formData.append("documents", file2);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("files processed");
        expect(result.values).toEqual({
          documents: ["file1.txt", "file2.txt"], // Multiple files as array
        });
      }
    });
  });

  describe("React Internal Keys Filtering", () => {
    it("should filter out React's internal $ACTION keys", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "processed";
          }),
      );

      const formData = new FormData();
      formData.append("name", "John");
      formData.append("$ACTION_ID_123", "some-action-id");
      formData.append("$ACTION_REF", "some-ref");
      formData.append("$ACTION_456", "another-internal");
      formData.append("email", "john@example.com");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed");
        // Should exclude all $ACTION* keys
        expect(result.values).toEqual({
          name: "John",
          email: "john@example.com",
        });
        // Verify $ACTION* keys are not present
        expect(result.values).not.toHaveProperty("$ACTION_ID_123");
        expect(result.values).not.toHaveProperty("$ACTION_REF");
        expect(result.values).not.toHaveProperty("$ACTION_456");
      }
    });
  });

  describe("Different Result Formats", () => {
    it("should not include values in functional result format", async () => {
      const action = craft((action) =>
        action
          .config({
            resultFormat: "functional",
          })
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const userInput = {
        name: "Jane",
        email: "jane@example.com",
        age: 30,
      };

      const result = await action(userInput);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe("Hello Jane!");
        // Functional format doesn't include values field
        expect(result).not.toHaveProperty("values");
      }
    });

    it("should not include values in api result format", async () => {
      const action = craft((action) =>
        action
          .config({
            resultFormat: "api",
          })
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const userInput = {
        name: "Jane",
        email: "jane@example.com",
        age: 30,
      };

      const result = await action(userInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("Hello Jane!");
        // API format doesn't include values field
        expect(result).not.toHaveProperty("values");
      }
    });
  });

  describe("Bind Args Scenarios", () => {
    it("should handle actions with bind args", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            bindSchemas: [z.string(), z.number()] as const,
            inputSchema: userSchema,
          })
          .handler(async ({ input, bindArgs }) => {
            const [prefix, multiplier] = bindArgs;
            return `${prefix as string}: ${input.name} (${
              input.age * (multiplier as number)
            })`;
          }),
      );

      const userInput = {
        name: "Jane",
        email: "jane@example.com",
        age: 30,
      };

      const result = await action("User", 2, initial(action), userInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("User: Jane (60)");
        // values should still work with bind args
        expect(result.values).toEqual(userInput);
      }
    });
  });

  describe("Complex Object Scenarios", () => {
    it("should handle nested objects", async () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string(),
          profile: z.object({
            bio: z.string(),
            age: z.number(),
          }),
        }),
        settings: z.object({
          theme: z.string(),
          notifications: z.boolean(),
        }),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: nestedSchema })
          .handler(async ({ input }) => {
            return `User: ${input.user.name}`;
          }),
      );

      const nestedInput = {
        user: {
          name: "John",
          profile: {
            bio: "Developer",
            age: 30,
          },
        },
        settings: {
          theme: "dark",
          notifications: true,
        },
      };

      const result = await action(initial(action), nestedInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("User: John");
        // values should preserve nested structure
        expect(result.values).toEqual(nestedInput);
        expect(result.values?.user?.name).toBe("John");
        expect(result.values?.user?.profile?.bio).toBe("Developer");
        expect(result.values?.settings?.theme).toBe("dark");
      }
    });

    it("should handle schemas with unknown fields", async () => {
      const schemaWithUnknown = z.object({
        name: z.string(),
        metadata: z.unknown(), // This should get special handling
        config: z.record(z.unknown()),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: schemaWithUnknown })
          .handler(async ({ input }) => {
            return `User: ${input.name}`;
          }),
      );

      const input = {
        name: "John",
        metadata: { custom: "data" },
        config: { theme: "dark", lang: "en" },
      };

      const result = await action(initial(action), input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("User: John");
        // values should handle unknown fields properly
        expect(result.values).toEqual(input);
        expect(result.values?.name).toBe("John");
      }
    });
  });

  describe("Edge Cases with Complex FormData", () => {
    it("should handle FormData with duplicate keys", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "processed";
          }),
      );

      const formData = new FormData();
      formData.append("tags", "javascript");
      formData.append("tags", "typescript");
      formData.append("tags", "react");
      formData.append("category", "programming");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed");
        expect(result.values).toEqual({
          tags: ["javascript", "typescript", "react"],
          category: "programming", // Single value remains as string
        });
      }
    });

    it("should handle mixed File and string values with same key", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => {
            return "processed";
          }),
      );

      const formData = new FormData();
      const file = new File(["content"], "test.txt", { type: "text/plain" });
      formData.append("attachments", "link-to-resource");
      formData.append("attachments", file);
      formData.append("attachments", "another-link");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed");
        expect(result.values).toEqual({
          attachments: ["link-to-resource", "test.txt", "another-link"],
        });
      }
    });
  });

  describe("Error States with Serialization", () => {
    it("should provide raw values on validation errors", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userFormDataSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const invalidFormData = new FormData();
      invalidFormData.append("name", "John");
      invalidFormData.append("invalid-field", "should-not-validate");
      // Missing required email and age fields

      const result = await action(initial(action), invalidFormData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        // values should contain raw FormData values for form repopulation
        expect(result.values).toEqual({
          name: "John",
          "invalid-field": "should-not-validate",
        });
      }
    });

    it("should handle action handler errors with values", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userSchema })
          .errors({
            userNotFound: () => ({
              type: "USER_NOT_FOUND" as const,
              message: "User not found",
            }),
          })
          .handler(async ({ input, errors }) => {
            if (input.name === "nonexistent") {
              return errors.userNotFound();
            }
            return `Hello ${input.name}!`;
          }),
      );

      const userInput = {
        name: "nonexistent",
        email: "test@example.com",
        age: 25,
      };

      const result = await action(initial(action), userInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("USER_NOT_FOUND");
        // values should still be available for error states
        expect(result.values).toEqual(userInput);
      }
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle validation errors while still providing values", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userFormDataSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const invalidFormData = new FormData();
      invalidFormData.append("name", "John");
      // Missing required email and age fields

      const result = await action(initial(action), invalidFormData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        // values should still contain the raw input for form repopulation
        expect(result.values).toEqual({
          name: "John",
        });
      }
    });

    it("should handle non-FormData input", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async ({ metadata: _metadata }) => {
            return "processed";
          }),
      );

      const result = await action(initial(action), "some string");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed");
        // values should be the raw input
        expect(result.values).toBe("some string");
      }
    });
  });

  describe("Type inference verification", () => {
    it("should provide correct types for all scenarios", async () => {
      // Scenario 1: With inputSchema
      const action1 = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userFormDataSchema })
          .handler(async () => "test"),
      );

      // Scenario 2: With different inputSchema
      const action2 = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userSchema })
          .handler(async () => "test"),
      );

      // Scenario 3: Without inputSchema
      const action3 = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .handler(async () => "test"),
      );

      // These should all have different types for the values field
      const formData1 = new FormData();
      formData1.append("name", "test");
      formData1.append("email", "test@test.com");
      formData1.append("age", "25");
      const result1 = await action1(initial(action1), formData1);
      const result2 = await action2(initial(action2), {
        name: "test",
        email: "test@test.com",
        age: 25,
      });
      const formData3 = new FormData();
      formData3.append("name", "test");
      formData3.append("email", "test@test.com");
      formData3.append("age", "25");
      const result3 = await action3(initial(action3), formData3);

      // Verify the types are working correctly
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      if (result1.success && result2.success && result3.success) {
        // result1.values should be the FormData schema type
        expect((result1.values as any)?.name).toBe("test");
        expect((result1.values as any)?.email).toBe("test@test.com");
        expect((result1.values as any)?.age).toBe(25);

        // result2.values should be the regular schema input type
        expect(result2.values?.name).toBe("test");
        expect(result2.values?.email).toBe("test@test.com");
        expect(result2.values?.age).toBe(25);

        // result3.values should be unknown without schema
        expect(typeof result3.values).toBe("object");
      }
    });
  });

  describe("IntelliSense demonstration", () => {
    it("should provide IntelliSense for field names", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const userInput = {
        name: "Jane",
        email: "jane@example.com",
        age: 30,
      };

      const result = await action(initial(action), userInput);

      expect(result.success).toBe(true);
      if (result.success) {
        // This should have IntelliSense for field names
        // TypeScript knows about name, email, age from the schema
        expect(result.values?.name).toBe("Jane");
        expect(result.values?.email).toBe("jane@example.com");
        expect(result.values?.age).toBe(30);

        // This should show a TypeScript error (field doesn't exist)
        // expect(result.values.nonexistentField).toBe("test");
      }
    });

    it("should provide IntelliSense for FormData schemas", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userFormDataSchema })
          .handler(async ({ input }) => {
            return `Hello ${input.name}!`;
          }),
      );

      const formData = new FormData();
      formData.append("name", "John");
      formData.append("email", "john@example.com");
      formData.append("age", "25");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        // This should have IntelliSense for field names
        // TypeScript knows about name, email, age from the schema
        expect(result.values?.name).toBe("John");
        expect(result.values?.email).toBe("john@example.com");
        expect(result.values?.age).toBe(25); // Parsed number

        // This should show a TypeScript error (field doesn't exist)
        // expect(result.values.nonexistentField).toBe("test");
      }
    });
  });

  describe("Additional edge cases", () => {
    it("should handle Blob objects without filename inside FormData", async () => {
      const action = craft((action) =>
        action
          .config({ useActionState: true })
          .handler(async () => "blob processed"),
      );

      const formData = new FormData();
      const blob = new Blob(["hello"], { type: "text/plain" });
      formData.append("attachment", blob);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("blob processed");
        // In the test environment, a Blob with no filename is converted to a File with default name "blob"
        expect(result.values).toEqual({ attachment: "blob" });
      }
    });

    it("should propagate undefined values field when action takes no input", async () => {
      const action = craft((action) =>
        action.config({ useActionState: true }).handler(async () => "no input"),
      );

      const result = await action(
        initial(action),
        undefined as unknown as never,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("no input");
        expect(result.values).toBeUndefined();
      }
    });

    it("should pass through primitive non-string raw inputs", async () => {
      const action = craft((action) =>
        action
          .config({ useActionState: true })
          .handler(async () => "processed"),
      );

      const result = await action(initial(action), 123);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("processed");
        expect(result.values).toBe(123);
      }
    });
  });
});
