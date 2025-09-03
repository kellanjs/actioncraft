import { craft, initial } from "../../src/index";
import {
  createFormData,
  userSchema,
  simpleUserSchema,
} from "../fixtures/schemas";
import { describe, expect, it } from "../setup";
import { zfd } from "zod-form-data";
import { z } from "zod/v4";

describe("Progressive Enhancement", () => {
  describe("Server-Only Form Processing", () => {
    it("should handle FormData submissions without client-side JavaScript", async () => {
      // This simulates a form submission in a browser with JavaScript disabled
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({
            inputSchema: zfd.formData({
              name: zfd.text(z.string().min(1, "Name required")),
              email: zfd.text(z.string().email("Valid email required")),
              age: zfd.numeric(z.number().min(18, "Must be 18 or older")),
            }),
          })
          .handler(async ({ input, metadata }) => {
            return {
              success: true,
              processedData: input,
              wasFormData: metadata.rawInput instanceof FormData,
              serverProcessed: true,
            };
          }),
      );

      const formData = createFormData({
        name: "Server User",
        email: "server@example.com",
        age: "25",
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.processedData.name).toBe("Server User");
        expect(result.data.processedData.age).toBe(25);
        expect(result.data.wasFormData).toBe(true);
        expect(result.data.serverProcessed).toBe(true);
      }
    });

    it("should provide validation errors suitable for server-side rendering", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: userSchema })
          .handler(async ({ input }) => {
            return { user: input };
          }),
      );

      // Invalid data that would normally be caught by client-side validation
      const invalidData = {
        name: "",
        email: "not-an-email",
        age: 15,
      };

      const result = await action(initial(action), invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        // Flattened format is better for displaying in server-rendered forms
        if ("issues" in result.error) {
          expect(Array.isArray(result.error.issues)).toBe(true);
          expect(result.error.issues.length).toBeGreaterThan(0);
        }
      }
    });

    it("should include values field with validated input on successful FormData submission", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: zfd.formData({
              name: zfd.text(z.string().min(1)),
              email: zfd.text(z.string().email()),
              age: zfd.numeric(z.number().min(18)),
            }),
          })
          .handler(async ({ input }) => {
            return { ok: true, input };
          }),
      );

      const formData = createFormData({
        name: "Server User",
        email: "server@example.com",
        age: "42",
      });

      const result = await action(initial(action), formData);

      expect(result).toEqual({
        success: true,
        data: {
          ok: true,
          input: { name: "Server User", email: "server@example.com", age: 42 },
        },
        values: { name: "Server User", email: "server@example.com", age: 42 },
        __ac_id: expect.any(String),
      });
    });

    it("should preserve raw input values on validation error for server-rendered forms", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({
            inputSchema: userSchema,
          })
          .handler(async ({ input }) => {
            return { user: input };
          }),
      );

      const invalidData = {
        name: "",
        email: "not-an-email",
        age: 15,
      } as const;

      const result = await action(initial(action), invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.values).toEqual(invalidData);
      }
    });
  });

  describe("Dual Input Support", () => {
    it("should work consistently with both FormData and regular objects", async () => {
      // The same action should handle both:
      // 1. FormData from server-rendered forms (no JS)
      // 2. Regular objects from client-side code (with JS)

      const flexibleAction = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: z.union([
              userSchema,
              zfd.formData({
                name: zfd.text(z.string().min(1, "Name required")),
                email: zfd.text(z.string().email("Valid email required")),
                age: zfd.numeric(z.number().min(18, "Must be 18 or older")),
              }),
            ]),
          })
          .handler(async ({ input, metadata }) => {
            return {
              userData: input,
              inputType:
                metadata.rawInput instanceof FormData ? "FormData" : "Object",
              processed: true,
            };
          }),
      );

      // Scenario 1: FormData (server-rendered form)
      const formData = createFormData({
        name: "Form User",
        email: "form@example.com",
        age: "30",
      });

      const formResult = await flexibleAction(
        initial(flexibleAction),
        formData,
      );
      expect(formResult.success).toBe(true);
      if (formResult.success) {
        expect(formResult.data.userData.name).toBe("Form User");
        expect(formResult.data.inputType).toBe("FormData");
      }

      // Scenario 2: Regular object (client-side/API)
      const objectData = {
        name: "Object User",
        email: "object@example.com",
        age: 28,
      };

      const objectResult = await flexibleAction(
        initial(flexibleAction),
        objectData,
      );
      expect(objectResult.success).toBe(true);
      if (objectResult.success) {
        expect(objectResult.data.userData.name).toBe("Object User");
        expect(objectResult.data.inputType).toBe("Object");
      }

      // Both should work and produce similar results
      expect(formResult.success).toBe(objectResult.success);
    });
  });

  describe("State Management Without JavaScript", () => {
    it("should maintain state across form submissions in server-only environments", async () => {
      const statefulAction = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: simpleUserSchema })
          .handler(async ({ input, metadata }) => {
            const previousState = metadata.prevState;
            const prevCount =
              previousState?.success &&
              typeof previousState.data === "object" &&
              previousState.data &&
              "count" in previousState.data
                ? (previousState.data.count as number)
                : 0;

            return {
              user: input,
              count: prevCount + 1,
              timestamp: new Date().toISOString(),
            };
          }),
      );

      // First submission
      const firstResult = await statefulAction(initial(statefulAction), {
        name: "User 1",
        age: 25,
      });
      expect(firstResult.success).toBe(true);
      if (firstResult.success) {
        expect(firstResult.data.count).toBe(1);
        expect(firstResult.data.user.name).toBe("User 1");
      }

      // Second submission using previous state
      const secondResult = await statefulAction(firstResult, {
        name: "User 2",
        age: 30,
      });
      expect(secondResult.success).toBe(true);
      if (secondResult.success) {
        expect(secondResult.data.count).toBe(2);
        expect(secondResult.data.user.name).toBe("User 2");
      }
    });
  });

  describe("Server-Side Business Logic", () => {
    it("should handle server-specific validation that client cannot perform", async () => {
      const serverValidationAction = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: userSchema })
          .errors({
            serverRejection: (reason: string) => ({
              type: "SERVER_REJECTION" as const,
              reason,
              message: `Server rejected submission: ${reason}`,
            }),
          })
          .handler(async ({ input, errors }) => {
            // Simulate server-side checks that client-side JS cannot perform
            // e.g., database lookups, external API calls, etc.

            if (input.email === "banned@example.com") {
              return errors.serverRejection("Email address is banned");
            }

            if (input.name.toLowerCase().includes("spam")) {
              return errors.serverRejection("Name contains prohibited content");
            }

            return {
              user: input,
              serverValidated: true,
              checkedAgainstDatabase: true,
            };
          }),
      );

      // Test server-side rejection
      const bannedEmailResult = await serverValidationAction(
        initial(serverValidationAction),
        {
          name: "Good User",
          email: "banned@example.com",
          age: 25,
        },
      );

      expect(bannedEmailResult.success).toBe(false);
      if (!bannedEmailResult.success) {
        expect(bannedEmailResult.error.type).toBe("SERVER_REJECTION");
      }

      // Test valid submission
      const validResult = await serverValidationAction(
        initial(serverValidationAction),
        {
          name: "Valid User",
          email: "valid@example.com",
          age: 25,
        },
      );

      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data.serverValidated).toBe(true);
        expect(validResult.data.checkedAgainstDatabase).toBe(true);
      }
    });
  });

  describe("File Upload Progressive Enhancement", () => {
    it("should handle file uploads in server-only context", async () => {
      const fileUploadAction = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({
            inputSchema: zfd.formData({
              title: zfd.text(z.string().min(1, "Title required")),
              document: zfd.file(z.instanceof(File)),
            }),
          })
          .handler(async ({ input }) => {
            return {
              title: input.title,
              fileInfo: {
                name: input.document.name,
                size: input.document.size,
                type: input.document.type,
              },
              processedOnServer: true,
            };
          }),
      );

      const formData = new FormData();
      formData.append("title", "Test Document");
      formData.append(
        "document",
        new File(["content"], "test.pdf", { type: "application/pdf" }),
      );

      const result = await fileUploadAction(
        initial(fileUploadAction),
        formData,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Test Document");
        expect(result.data.fileInfo.name).toBe("test.pdf");
        expect(result.data.fileInfo.type).toBe("application/pdf");
        expect(result.data.processedOnServer).toBe(true);
      }
    });
  });
});
