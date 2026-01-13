import { actioncraft } from "../../../src/index";
import {
  stringSchema,
  numberSchema,
  userSchema,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "vitest";

describe("Schema Validation ($validate)", () => {
  describe("Basic validation", () => {
    it("should validate input successfully with valid data", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const result = await action.$validate({
        name: "John",
        email: "john@example.com",
        age: 25,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("John");
        expect(result.data.email).toBe("john@example.com");
        expect(result.data.age).toBe(25);
      }
    });

    it("should return validation errors for invalid data", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const result = await action.$validate({
        name: "",
        email: "invalid-email",
        age: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect(result.error.message).toContain("Input validation failed");
      }
    });

    it("should handle actions without input schema", async () => {
      const action = actioncraft()
        .handler(async () => "no input required")
        .build();

      const result = await action.$validate("anything");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("NO_INPUT_SCHEMA");
        expect(result.error.message).toContain("no input schema defined");
      }
    });
  });

  describe("Different schema types", () => {
    it("should validate string schema", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => input.toUpperCase())
        .build();

      const validResult = await action.$validate("hello");
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toBe("hello");
      }

      const invalidResult = await action.$validate(123 as any);
      expect(invalidResult.success).toBe(false);
    });

    it("should validate number schema", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: numberSchema })
        .handler(async ({ input }) => input * 2)
        .build();

      const validResult = await action.$validate(42);
      expect(validResult.success).toBe(true);
      if (validResult.success) {
        expect(validResult.data).toBe(42);
      }

      const invalidResult = await action.$validate("not a number" as any);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("Error format configuration", () => {
    it("should respect flattened error format", async () => {
      const action = actioncraft()
        .config({ validationErrorFormat: "flattened" })
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const result = await action.$validate({
        name: "",
        email: "invalid",
        age: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect("issues" in result.error).toBe(true);
      }
    });

    it("should respect nested error format", async () => {
      const action = actioncraft()
        .config({ validationErrorFormat: "nested" })
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const result = await action.$validate({
        name: "",
        email: "invalid",
        age: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        expect(
          "formErrors" in result.error || "fieldErrors" in result.error,
        ).toBe(true);
      }
    });
  });

  describe("Type safety", () => {
    it("should provide correct TypeScript types", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => ({ processedUser: input }))
        .build();

      const result = await action.$validate({
        name: "John",
        email: "john@example.com",
        age: 25,
      });

      // Type assertions to verify inference
      if (result.success) {
        // Should be typed as the validated user object
        const user: { name: string; email: string; age: number } = result.data;
        expect(user.name).toBe("John");
      } else {
        // Should be typed as validation error
        const error = result.error;
        expect(error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Integration with action execution", () => {
    it("should validate the same way as action execution", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => ({ processedUser: input }))
        .build();

      const invalidInput = {
        name: "",
        email: "invalid-email",
        age: -1,
      };

      // Validate using $validate
      const validateResult = await action.$validate(invalidInput);
      expect(validateResult.success).toBe(false);

      // Execute the action with the same invalid input
      const actionResult = await action(invalidInput);
      expect(actionResult.success).toBe(false);

      // Both should have the same error type
      if (!validateResult.success && !actionResult.success) {
        expect(validateResult.error.type).toBe(actionResult.error.type);
        expect(validateResult.error.message).toBe(actionResult.error.message);
      }
    });

    it("should return identical error structures as convertToClientError", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const invalidInput = {
        name: "",
        email: "invalid",
        age: -1,
      };

      const validateResult = await action.$validate(invalidInput);
      const actionResult = await action(invalidInput);

      expect(validateResult.success).toBe(false);
      expect(actionResult.success).toBe(false);

      if (!validateResult.success && !actionResult.success) {
        // Should have identical error structures
        expect(validateResult.error).toEqual(actionResult.error);
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle undefined input", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => input)
        .build();

      const result = await action.$validate(undefined as any);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle null input", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: stringSchema })
        .handler(async ({ input }) => input)
        .build();

      const result = await action.$validate(null as any);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should handle FormData input with object schema", async () => {
      const action = actioncraft()
        .schemas({ inputSchema: userSchema })
        .handler(async ({ input }) => input)
        .build();

      const formData = new FormData();
      formData.append("name", "John");
      formData.append("email", "john@example.com");
      formData.append("age", "25");

      const result = await action.$validate(formData as any);
      // This should fail because userSchema expects an object, not FormData
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should use the NO_INPUT_SCHEMA_ERROR constant from errors.ts", async () => {
      const action = actioncraft()
        .handler(async () => "no schema")
        .build();

      const result = await action.$validate("anything");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("NO_INPUT_SCHEMA");
        expect(result.error.message).toBe(
          "Cannot validate input: no input schema defined for this action",
        );
      }
    });
  });
});
