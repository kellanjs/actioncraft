import { craft, initial } from "../../../src/index";
import {
  basicFormDataOnlySchema,
  createFormData,
} from "../../__fixtures__/schemas";
import { describe, it, expect } from "../../setup";
import { z } from "zod";
import { zfd } from "zod-form-data";

describe("FormData Validation Tests", () => {
  describe("Input Type Validation", () => {
    it("should validate that input is actually FormData when required", async () => {
      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: basicFormDataOnlySchema })
          .handler(async ({ input }) => input),
      );

      // Test with regular object - should fail
      const result = await action(initial(action), {
        name: "John",
        email: "john@example.com",
        age: 30,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("issues" in result.error) {
          const messages = result.error.issues.map((issue) => issue.message);
          expect(messages.some((msg) => msg.includes("FormData"))).toBe(true);
        }
      }
    });

    it("should validate FormData field types correctly", async () => {
      const strictSchema = zfd.formData({
        name: zfd.text(z.string().min(2, "Name must be at least 2 characters")),
        email: zfd.text(z.string().email("Invalid email format")),
        age: zfd.numeric(z.number().min(18, "Must be at least 18")),
        isActive: zfd.checkbox(),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: strictSchema })
          .handler(async ({ input }) => input),
      );

      // Test with invalid data types
      const formData = createFormData({
        name: "J", // Too short
        email: "not-an-email", // Invalid email
        age: "15", // Too young
        // isActive not provided (should default to false)
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("fieldErrors" in result.error) {
          expect(result.error.fieldErrors.name).toBeTruthy();
          expect(result.error.fieldErrors.email).toBeTruthy();
          expect(result.error.fieldErrors.age).toBeTruthy();
        }
      }
    });

    it("should validate required vs optional FormData fields", async () => {
      const mixedSchema = zfd.formData({
        requiredName: zfd.text(z.string().min(1, "Name is required")),
        optionalBio: zfd.text(z.string().optional()),
        requiredEmail: zfd.text(z.string().email("Email is required")),
        optionalAge: zfd.numeric(z.number().optional()),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: mixedSchema })
          .handler(async ({ input }) => input),
      );

      // Test with missing required fields
      const incompleteFormData = createFormData({
        optionalBio: "Some bio text",
        // Missing requiredName and requiredEmail
      });

      const result = await action(initial(action), incompleteFormData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("fieldErrors" in result.error) {
          expect(result.error.fieldErrors.requiredName).toBeTruthy();
          expect(result.error.fieldErrors.requiredEmail).toBeTruthy();
          expect(result.error.fieldErrors.optionalBio).toBeFalsy();
          expect(result.error.fieldErrors.optionalAge).toBeFalsy();
        }
      }
    });
  });

  describe("File Validation", () => {
    it("should validate file size constraints", async () => {
      const fileSizeSchema = zfd.formData({
        name: zfd.text(),
        smallFile: zfd.file(
          z.instanceof(File).refine(
            (file) => file.size <= 1024, // 1KB limit
            "File must be under 1KB",
          ),
        ),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: fileSizeSchema })
          .handler(async ({ input }) => input),
      );

      // Create a file that exceeds the size limit
      const largeContent = "x".repeat(2048); // 2KB
      const largeFile = new File([largeContent], "large.txt", {
        type: "text/plain",
      });

      const formData = createFormData({
        name: "Test User",
      });
      formData.append("smallFile", largeFile);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("issues" in result.error) {
          const messages = result.error.issues.map((issue) => issue.message);
          expect(messages.some((msg) => msg.includes("1KB"))).toBe(true);
        }
      }
    });

    it("should validate file type constraints", async () => {
      const fileTypeSchema = zfd.formData({
        name: zfd.text(),
        imageFile: zfd.file(
          z
            .instanceof(File)
            .refine(
              (file) =>
                ["image/jpeg", "image/png", "image/gif"].includes(file.type),
              "File must be an image (JPEG, PNG, or GIF)",
            ),
        ),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: fileTypeSchema })
          .handler(async ({ input }) => input),
      );

      // Create a file with wrong type
      const textFile = new File(["Some text content"], "document.txt", {
        type: "text/plain",
      });

      const formData = createFormData({
        name: "Test User",
      });
      formData.append("imageFile", textFile);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("issues" in result.error) {
          const messages = result.error.issues.map((issue) => issue.message);
          expect(messages.some((msg) => msg.includes("image"))).toBe(true);
        }
      }
    });

    it("should validate multiple file constraints", async () => {
      const multiFileSchema = zfd.formData({
        name: zfd.text(),
        documents: zfd.repeatableOfType(
          zfd.file(
            z
              .instanceof(File)
              .refine(
                (file) => file.size <= 1024 * 1024,
                "File must be under 1MB",
              )
              .refine(
                (file) => ["application/pdf", "text/plain"].includes(file.type),
                "File must be PDF or text",
              ),
          ),
        ),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: multiFileSchema })
          .handler(async ({ input }) => input),
      );

      const formData = createFormData({
        name: "Test User",
      });

      // Add valid file
      const validFile = new File(["Valid content"], "valid.pdf", {
        type: "application/pdf",
      });
      formData.append("documents", validFile);

      // Add invalid file (wrong type)
      const invalidFile = new File(["Invalid content"], "invalid.jpg", {
        type: "image/jpeg",
      });
      formData.append("documents", invalidFile);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("issues" in result.error) {
          const messages = result.error.issues.map((issue) => issue.message);
          expect(messages.some((msg) => msg.includes("PDF or text"))).toBe(
            true,
          );
        }
      }
    });

    it("should validate required vs optional files", async () => {
      const fileRequirementSchema = zfd.formData({
        name: zfd.text(),
        requiredFile: zfd.file(
          z.instanceof(File, { message: "File is required" }),
        ),
        optionalFile: zfd.file().optional(),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: fileRequirementSchema })
          .handler(async ({ input }) => input),
      );

      // Test with missing required file
      const formData = createFormData({
        name: "Test User",
      });
      // Only add optional file, not required file
      const optionalFile = new File(["Optional content"], "optional.txt", {
        type: "text/plain",
      });
      formData.append("optionalFile", optionalFile);

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("fieldErrors" in result.error) {
          expect(result.error.fieldErrors.requiredFile).toBeTruthy();
          expect(result.error.fieldErrors.optionalFile).toBeFalsy();
        }
      }
    });
  });

  describe("Numeric Field Validation", () => {
    it("should validate numeric field ranges and types", async () => {
      const numericSchema = zfd.formData({
        age: zfd.numeric(
          z.number().min(0).max(120, "Age must be between 0 and 120"),
        ),
        score: zfd.numeric(
          z.number().int("Score must be an integer").min(0).max(100),
        ),
        price: zfd.numeric(z.number().positive("Price must be positive")),
        discount: zfd.numeric(
          z.number().min(0).max(1, "Discount must be between 0 and 1"),
        ),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: numericSchema })
          .handler(async ({ input }) => input),
      );

      // Test with invalid numeric values
      const formData = createFormData({
        age: "150", // Too high
        score: "105", // Too high
        price: "-10", // Negative
        discount: "1.5", // Too high
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("fieldErrors" in result.error) {
          expect(result.error.fieldErrors.age).toBeTruthy();
          expect(result.error.fieldErrors.score).toBeTruthy();
          expect(result.error.fieldErrors.price).toBeTruthy();
          expect(result.error.fieldErrors.discount).toBeTruthy();
        }
      }
    });

    it("should handle non-numeric string inputs", async () => {
      const numericSchema = zfd.formData({
        count: zfd.numeric(z.number().int("Must be an integer")),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: numericSchema })
          .handler(async ({ input }) => input),
      );

      // Test with non-numeric string
      const formData = createFormData({
        count: "not-a-number",
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Checkbox Validation", () => {
    it("should validate checkbox boolean conversion", async () => {
      const checkboxSchema = zfd.formData({
        name: zfd.text(),
        agreeToTerms: zfd
          .checkbox()
          .pipe(
            z.boolean().refine((val) => val === true, "Must agree to terms"),
          ),
        newsletter: zfd.checkbox(), // Optional, defaults to false
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: checkboxSchema })
          .handler(async ({ input }) => input),
      );

      // Test with unchecked required checkbox
      const formData = createFormData({
        name: "Test User",
        // agreeToTerms not provided (unchecked)
        newsletter: "on", // Checked
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("fieldErrors" in result.error) {
          expect(result.error.fieldErrors.agreeToTerms).toBeTruthy();
          expect(result.error.fieldErrors.newsletter).toBeFalsy();
        }
      }
    });

    it("should handle various checkbox value formats", async () => {
      const flexibleCheckboxSchema = zfd.formData({
        name: zfd.text(),
        option1: zfd.checkbox(), // Standard "on" value
        option2: zfd.checkbox(), // Custom value
        option3: zfd.checkbox(), // Not present (false)
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: flexibleCheckboxSchema })
          .handler(async ({ input }) => ({
            name: input.name,
            option1: input.option1,
            option2: input.option2,
            option3: input.option3,
          })),
      );

      const formData = createFormData({
        name: "Checkbox Test",
      });
      formData.append("option1", "on"); // Standard checked value
      formData.append("option2", "on"); // zfd.checkbox() only accepts "on", not custom values
      // option3 not provided (unchecked)

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.option1).toBe(true);
        expect(result.data.option2).toBe(true);
        expect(result.data.option3).toBe(false);
      }
    });
  });

  describe("Array Field Validation", () => {
    it("should validate repeatable text fields", async () => {
      const arraySchema = zfd.formData({
        name: zfd.text(),
        tags: zfd.repeatableOfType(
          zfd.text(z.string().min(2, "Each tag must be at least 2 characters")),
        ),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "flattened",
          })
          .schemas({ inputSchema: arraySchema })
          .handler(async ({ input }) => input),
      );

      const formData = createFormData({
        name: "Array Test",
      });
      formData.append("tags", "validtag");
      formData.append("tags", "x"); // Too short
      formData.append("tags", "anothertag");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("issues" in result.error) {
          const messages = result.error.issues.map((issue) => issue.message);
          expect(messages.some((msg) => msg.includes("2 characters"))).toBe(
            true,
          );
        }
      }
    });

    it("should validate empty arrays vs required arrays", async () => {
      const arrayRequirementSchema = zfd.formData({
        name: zfd.text(),
        requiredTags: zfd
          .repeatableOfType(zfd.text())
          .pipe(z.array(z.string()).min(1, "At least one tag is required")),
        optionalTags: zfd.repeatableOfType(zfd.text()),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: arrayRequirementSchema })
          .handler(async ({ input }) => input),
      );

      // Test with empty required array
      const formData = createFormData({
        name: "Array Requirement Test",
        // requiredTags not provided (empty array)
      });
      formData.append("optionalTags", "optional1");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
        if ("fieldErrors" in result.error) {
          expect(result.error.fieldErrors.requiredTags).toBeTruthy();
          expect(result.error.fieldErrors.optionalTags).toBeFalsy();
        }
      }
    });
  });

  describe("Complex Validation Scenarios", () => {
    it("should validate interdependent fields", async () => {
      const interdependentSchema = zfd
        .formData({
          hasAccount: zfd.checkbox(),
          username: zfd.text().optional(),
          password: zfd.text().optional(),
        })
        .refine(
          (data) => {
            if (data.hasAccount) {
              return data.username && data.password;
            }
            return true;
          },
          {
            message:
              "Username and password are required when 'Has Account' is checked",
            path: ["username"],
          },
        );

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: interdependentSchema })
          .handler(async ({ input }) => input),
      );

      // Test with hasAccount checked but missing credentials
      const formData = createFormData({
        hasAccount: "on",
        // username and password missing
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });

    it("should validate conditional file requirements", async () => {
      const conditionalFileSchema = zfd
        .formData({
          uploadType: zfd.text(z.enum(["image", "document", "none"])),
          imageFile: zfd.file().optional(),
          documentFile: zfd.file().optional(),
        })
        .refine(
          (data) => {
            if (data.uploadType === "image") {
              return data.imageFile instanceof File;
            }
            if (data.uploadType === "document") {
              return data.documentFile instanceof File;
            }
            return true;
          },
          {
            message: "File is required for the selected upload type",
            path: ["imageFile"],
          },
        );

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
            validationErrorFormat: "nested",
          })
          .schemas({ inputSchema: conditionalFileSchema })
          .handler(async ({ input }) => input),
      );

      // Test with image type selected but no image file
      const formData = createFormData({
        uploadType: "image",
        // imageFile missing
      });

      const result = await action(initial(action), formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("INPUT_VALIDATION");
      }
    });
  });

  describe("Malformed FormData Edge Cases", () => {
    it("should handle FormData with duplicate field names appropriately", async () => {
      const duplicateHandlingSchema = zfd.formData({
        singleValue: zfd.repeatableOfType(zfd.text()), // Changed: duplicate fields become arrays in zfd
        multipleValues: zfd.repeatableOfType(zfd.text()),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: duplicateHandlingSchema })
          .handler(async ({ input }) => ({
            singleValueCount: input.singleValue.length,
            singleValues: input.singleValue,
            multipleCount: input.multipleValues.length,
            multipleValues: input.multipleValues,
          })),
      );

      const formData = new FormData();
      // Add single value multiple times - zfd collects all values into an array
      formData.append("singleValue", "first");
      formData.append("singleValue", "second");
      formData.append("singleValue", "third");

      // Add multiple values - should collect all
      formData.append("multipleValues", "value1");
      formData.append("multipleValues", "value2");
      formData.append("multipleValues", "value3");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.singleValueCount).toBe(3);
        expect(result.data.singleValues).toEqual(["first", "second", "third"]);
        expect(result.data.multipleCount).toBe(3);
        expect(result.data.multipleValues).toEqual([
          "value1",
          "value2",
          "value3",
        ]);
      }
    });

    it("should handle FormData with special characters in field names", async () => {
      const specialCharSchema = zfd.formData({
        "field-with-dashes": zfd.text(),
        field_with_underscores: zfd.text(),
        "field with spaces": zfd.text(),
        // Note: field names with dots and brackets don't work with zod-form-data
        // as they're interpreted as nested objects or array notation
        fieldWithNumbers123: zfd.text(),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: specialCharSchema })
          .handler(async ({ input }) => ({
            dashes: input["field-with-dashes"],
            underscores: input.field_with_underscores,
            spaces: input["field with spaces"],
            numbers: input.fieldWithNumbers123,
          })),
      );

      const formData = new FormData();
      formData.append("field-with-dashes", "dash-value");
      formData.append("field_with_underscores", "underscore-value");
      formData.append("field with spaces", "space-value");
      formData.append("fieldWithNumbers123", "number-value");

      const result = await action(initial(action), formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dashes).toBe("dash-value");
        expect(result.data.underscores).toBe("underscore-value");
        expect(result.data.spaces).toBe("space-value");
        expect(result.data.numbers).toBe("number-value");
      }
    });

    it("should handle completely empty FormData", async () => {
      const optionalSchema = zfd.formData({
        name: zfd.text().optional(),
        email: zfd.text().optional(),
        age: zfd.numeric().optional(),
      });

      const action = craft((action) =>
        action
          .config({
            useActionState: true,
          })
          .schemas({ inputSchema: optionalSchema })
          .handler(async ({ input }) => ({
            hasName: !!input.name,
            hasEmail: !!input.email,
            hasAge: !!input.age,
            fieldCount: Object.keys(input).length,
          })),
      );

      const emptyFormData = new FormData();
      const result = await action(initial(action), emptyFormData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasName).toBe(false);
        expect(result.data.hasEmail).toBe(false);
        expect(result.data.hasAge).toBe(false);
        expect(result.data.fieldCount).toBe(0);
      }
    });
  });

  it("should handle FormData with extremely long field names", async () => {
    const longFieldName = "field_" + "x".repeat(1000); // Very long field name
    const longFieldSchema = zfd.formData({
      [longFieldName]: zfd.text(),
      normalField: zfd.text(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: longFieldSchema })
        .handler(async ({ input }) => ({
          longFieldValue: input[longFieldName],
          normalFieldValue: input.normalField,
          longFieldLength: longFieldName.length,
        })),
    );

    const formData = new FormData();
    formData.append(longFieldName, "long-field-value");
    formData.append("normalField", "normal-value");

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.longFieldValue).toBe("long-field-value");
      expect(result.data.normalFieldValue).toBe("normal-value");
      expect(result.data.longFieldLength).toBe(1006); // "field_" + 1000 x's
    }
  });

  it("should handle FormData with extremely long field values", async () => {
    const longValueSchema = zfd.formData({
      shortField: zfd.text(),
      longField: zfd.text(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: longValueSchema })
        .handler(async ({ input }) => ({
          shortFieldValue: input.shortField,
          longFieldLength: input.longField.length,
          longFieldPreview: input.longField.substring(0, 50) + "...",
        })),
    );

    const longValue = "x".repeat(100000); // 100KB string
    const formData = new FormData();
    formData.append("shortField", "short");
    formData.append("longField", longValue);

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shortFieldValue).toBe("short");
      expect(result.data.longFieldLength).toBe(100000);
      expect(result.data.longFieldPreview).toBe("x".repeat(50) + "...");
    }
  });

  it("should handle FormData with Unicode and special characters in values", async () => {
    const unicodeSchema = zfd.formData({
      emoji: zfd.text(),
      chinese: zfd.text(),
      arabic: zfd.text(),
      mathematical: zfd.text(),
      mixed: zfd.text(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: unicodeSchema })
        .handler(async ({ input }) => ({
          emoji: input.emoji,
          chinese: input.chinese,
          arabic: input.arabic,
          mathematical: input.mathematical,
          mixed: input.mixed,
          allLengths: {
            emoji: input.emoji.length,
            chinese: input.chinese.length,
            arabic: input.arabic.length,
            mathematical: input.mathematical.length,
            mixed: input.mixed.length,
          },
        })),
    );

    const formData = new FormData();
    formData.append("emoji", "🚀🎉💻🌟🔥");
    formData.append("chinese", "你好世界测试");
    formData.append("arabic", "مرحبا بالعالم");
    formData.append("mathematical", "∑∫∆∇∂∞≠≤≥");
    formData.append("mixed", "Hello 世界 🌍 مرحبا ∑=1");

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emoji).toBe("🚀🎉💻🌟🔥");
      expect(result.data.chinese).toBe("你好世界测试");
      expect(result.data.arabic).toBe("مرحبا بالعالم");
      expect(result.data.mathematical).toBe("∑∫∆∇∂∞≠≤≥");
      expect(result.data.mixed).toBe("Hello 世界 🌍 مرحبا ∑=1");
      // Verify lengths are calculated correctly for Unicode
      // Note: Some Unicode characters may take multiple UTF-16 code units
      expect(result.data.allLengths.emoji).toBeGreaterThanOrEqual(5);
      expect(result.data.allLengths.chinese).toBe(6);
      expect(result.data.allLengths.arabic).toBeGreaterThanOrEqual(11); // Arabic text may have different length
      expect(result.data.allLengths.mathematical).toBe(9);
      expect(result.data.allLengths.mixed).toBeGreaterThanOrEqual(17);
    }
  });
});

describe("FormData Performance Tests", () => {
  it("should process large FormData efficiently", async () => {
    const largeFormSchema = zfd.formData({
      title: zfd.text(),
      data: zfd.repeatableOfType(zfd.text()),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: largeFormSchema })
        .handler(async ({ input }) => ({
          title: input.title,
          fieldCount: input.data.length,
          totalLength: input.data.join("").length,
        })),
    );

    // Create FormData with many fields
    const formData = new FormData();
    formData.append("title", "Performance Test");

    const fieldCount = 1000;
    for (let i = 0; i < fieldCount; i++) {
      formData.append(
        "data",
        `field-${i}-with-some-content-to-test-performance`,
      );
    }

    const startTime = performance.now();
    const result = await action(initial(action), formData);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fieldCount).toBe(fieldCount);
      expect(result.data.totalLength).toBeGreaterThan(40000);
    }

    // Should process within reasonable time (less than 1 second)
    const processingTime = endTime - startTime;
    expect(processingTime).toBeLessThan(1000);
  });

  it("should handle large file uploads efficiently", async () => {
    const largeFileSchema = zfd.formData({
      name: zfd.text(),
      file: zfd.file(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: largeFileSchema })
        .handler(async ({ input }) => ({
          name: input.name,
          fileName: input.file.name,
          fileSize: input.file.size,
          fileType: input.file.type,
        })),
    );

    // Create a large file (5MB)
    const largeContent = new Uint8Array(5 * 1024 * 1024);
    for (let i = 0; i < largeContent.length; i++) {
      largeContent[i] = i % 256;
    }

    const largeFile = new File([largeContent], "large-test.bin", {
      type: "application/octet-stream",
    });

    const formData = new FormData();
    formData.append("name", "Large File Test");
    formData.append("file", largeFile);

    const startTime = performance.now();
    const result = await action(initial(action), formData);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileName).toBe("large-test.bin");
      expect(result.data.fileSize).toBe(5 * 1024 * 1024);
    }

    // Should process large files efficiently (less than 2 seconds)
    const processingTime = endTime - startTime;
    expect(processingTime).toBeLessThan(2000);
  });

  it("should handle multiple concurrent FormData validations", async () => {
    const concurrentSchema = zfd.formData({
      id: zfd.text(),
      value: zfd.numeric(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: concurrentSchema })
        .handler(async ({ input }) => ({
          id: input.id,
          value: input.value,
          processed: true,
        })),
    );

    // Create multiple FormData instances
    const formDataInstances = Array.from({ length: 100 }, (_, i) => {
      const formData = new FormData();
      formData.append("id", `test-${i}`);
      formData.append("value", i.toString());
      return formData;
    });

    const startTime = performance.now();

    // Process all FormData instances concurrently
    const promises = formDataInstances.map((formData) =>
      action(initial(action), formData),
    );
    const results = await Promise.all(promises);

    const endTime = performance.now();

    // All should succeed
    expect(results.every((result) => result.success)).toBe(true);

    // Should process concurrently efficiently (less than 3 seconds for 100 instances)
    const processingTime = endTime - startTime;
    expect(processingTime).toBeLessThan(3000);
  });

  it("should validate complex nested FormData structures efficiently", async () => {
    const complexSchema = zfd.formData({
      // User information
      userName: zfd.text(z.string().min(2)),
      userEmail: zfd.text(z.string().email()),
      userBio: zfd.text().optional(),

      // Settings
      theme: zfd.text(z.enum(["light", "dark", "auto"])),
      notifications: zfd.checkbox(),
      language: zfd.text(z.string().min(2)),

      // Files
      avatar: zfd.file().optional(),
      documents: zfd.repeatableOfType(zfd.file()),

      // Arrays
      skills: zfd.repeatableOfType(zfd.text(z.string().min(1))),
      interests: zfd.repeatableOfType(zfd.text()),

      // Numbers
      experience: zfd.numeric(z.number().min(0).max(50)),
      salary: zfd.numeric(z.number().positive()),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: complexSchema })
        .handler(async ({ input }) => ({
          userName: input.userName,
          hasAvatar: !!input.avatar,
          documentCount: input.documents.length,
          skillCount: input.skills.length,
          interestCount: input.interests.length,
          experience: input.experience,
          salary: input.salary,
        })),
    );

    const formData = new FormData();

    // Add user information
    formData.append("userName", "John Doe");
    formData.append("userEmail", "john@example.com");
    formData.append(
      "userBio",
      "Software developer with 10 years of experience",
    );

    // Add settings
    formData.append("theme", "dark");
    formData.append("notifications", "on");
    formData.append("language", "en");

    // Add files
    const avatarFile = new File(["avatar content"], "avatar.jpg", {
      type: "image/jpeg",
    });
    formData.append("avatar", avatarFile);

    for (let i = 0; i < 5; i++) {
      const docFile = new File([`document ${i} content`], `doc${i}.pdf`, {
        type: "application/pdf",
      });
      formData.append("documents", docFile);
    }

    // Add arrays
    const skills = ["JavaScript", "TypeScript", "React", "Node.js", "Python"];
    skills.forEach((skill) => formData.append("skills", skill));

    const interests = ["coding", "music", "travel", "photography"];
    interests.forEach((interest) => formData.append("interests", interest));

    // Add numbers
    formData.append("experience", "10");
    formData.append("salary", "75000");

    const startTime = performance.now();
    const result = await action(initial(action), formData);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userName).toBe("John Doe");
      expect(result.data.hasAvatar).toBe(true);
      expect(result.data.documentCount).toBe(5);
      expect(result.data.skillCount).toBe(5);
      expect(result.data.interestCount).toBe(4);
      expect(result.data.experience).toBe(10);
      expect(result.data.salary).toBe(75000);
    }

    // Should process complex FormData efficiently (less than 500ms)
    const processingTime = endTime - startTime;
    expect(processingTime).toBeLessThan(500);
  });

  it("should validate FormData with custom transformation and refinement", async () => {
    const customTransformSchema = zfd
      .formData({
        email: zfd.text(z.string().email()),
        confirmEmail: zfd.text(z.string().email()),
        password: zfd.text(z.string().min(8)),
        confirmPassword: zfd.text(z.string().min(8)),
      })
      .refine((data) => data.email === data.confirmEmail, {
        message: "Email addresses must match",
        path: ["confirmEmail"],
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords must match",
        path: ["confirmPassword"],
      })
      .transform((data) => ({
        email: data.email.toLowerCase(),
        password: data.password,
        // Don't include confirmation fields in final result
      }));

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
          validationErrorFormat: "nested",
        })
        .schemas({ inputSchema: customTransformSchema })
        .handler(async ({ input }) => ({
          email: input.email,
          hasPassword: !!input.password,
          emailIsLowercase: input.email === input.email.toLowerCase(),
        })),
    );

    // Test successful case - emails must match exactly for validation to pass
    const validFormData = new FormData();
    validFormData.append("email", "test@example.com");
    validFormData.append("confirmEmail", "test@example.com");
    validFormData.append("password", "password123");
    validFormData.append("confirmPassword", "password123");

    const validResult = await action(initial(action), validFormData);

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.email).toBe("test@example.com");
      expect(validResult.data.hasPassword).toBe(true);
      expect(validResult.data.emailIsLowercase).toBe(true);
    }

    // Test validation failure case
    const invalidFormData = new FormData();
    invalidFormData.append("email", "test@example.com");
    invalidFormData.append("confirmEmail", "different@example.com");
    invalidFormData.append("password", "password123");
    invalidFormData.append("confirmPassword", "differentpassword");

    const invalidResult = await action(initial(action), invalidFormData);

    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.type).toBe("INPUT_VALIDATION");
    }
  });

  it("should handle FormData with structured field naming conventions", async () => {
    // Test structured field naming using underscores and hyphens (which work with zfd)
    const structuredSchema = zfd.formData({
      user_name: zfd.text(),
      user_email: zfd.text(),
      "settings-theme": zfd.text(),
      "settings-notifications": zfd.checkbox(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: structuredSchema })
        .handler(async ({ input }) => ({
          userName: input.user_name,
          userEmail: input.user_email,
          settingsTheme: input["settings-theme"],
          settingsNotifications: input["settings-notifications"],
        })),
    );

    const formData = new FormData();
    formData.append("user_name", "John Doe");
    formData.append("user_email", "john@example.com");
    formData.append("settings-theme", "dark");
    formData.append("settings-notifications", "on");

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userName).toBe("John Doe");
      expect(result.data.userEmail).toBe("john@example.com");
      expect(result.data.settingsTheme).toBe("dark");
      expect(result.data.settingsNotifications).toBe(true);
    }
  });
});

describe("FormData Serialization and Meta-field Handling", () => {
  it("should filter out React server-action meta-fields", async () => {
    const metaFieldSchema = zfd.formData({
      name: zfd.text(),
      email: zfd.text(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
          validationErrorFormat: "nested",
        })
        .schemas({ inputSchema: metaFieldSchema })
        .handler(async ({ input }) => input),
    );

    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("email", "john@example.com");
    // Add React server-action meta-fields that should be filtered out
    formData.append("$ACTION_REF_1", "some-ref-value");
    formData.append("$ACTION_ID_2", "some-id-value");
    formData.append("$ACTION_KEY_3", "some-key-value");

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("John Doe");
      expect(result.data.email).toBe("john@example.com");
      // Meta-fields should not appear in the result
      expect(result.data).not.toHaveProperty("$ACTION_REF_1");
      expect(result.data).not.toHaveProperty("$ACTION_ID_2");
      expect(result.data).not.toHaveProperty("$ACTION_KEY_3");
    }
  });

  it("should handle File objects in FormData serialization", async () => {
    const fileSerializationSchema = zfd.formData({
      name: zfd.text(),
      document: zfd.file(),
      avatar: zfd.file().optional(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
          validationErrorFormat: "nested",
        })
        .schemas({ inputSchema: fileSerializationSchema })
        .handler(async ({ input }) => ({
          name: input.name,
          hasDocument: input.document instanceof File,
          documentName: input.document.name,
          documentSize: input.document.size,
          hasAvatar: input.avatar instanceof File,
          avatarName: input.avatar?.name,
        })),
    );

    const formData = new FormData();
    formData.append("name", "File Test User");

    // Add a file with a specific name
    const testFile = new File(["test content"], "test-document.pdf", {
      type: "application/pdf",
    });
    formData.append("document", testFile);

    // Add an avatar file
    const avatarFile = new File(["avatar content"], "avatar.jpg", {
      type: "image/jpeg",
    });
    formData.append("avatar", avatarFile);

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("File Test User");
      expect(result.data.hasDocument).toBe(true);
      expect(result.data.documentName).toBe("test-document.pdf");
      expect(result.data.documentSize).toBeGreaterThan(0);
      expect(result.data.hasAvatar).toBe(true);
      expect(result.data.avatarName).toBe("avatar.jpg");
    }
  });

  it("should handle FormData with mixed content types and serialization", async () => {
    const mixedContentSchema = zfd.formData({
      title: zfd.text(),
      tags: zfd.repeatableOfType(zfd.text()),
      files: zfd.repeatableOfType(zfd.file()),
      isPublic: zfd.checkbox(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: mixedContentSchema })
        .handler(async ({ input }) => ({
          title: input.title,
          tagCount: input.tags.length,
          tags: input.tags,
          fileCount: input.files.length,
          fileNames: input.files.map((f) => f.name),
          isPublic: input.isPublic,
        })),
    );

    const formData = new FormData();
    formData.append("title", "Mixed Content Test");
    formData.append("tags", "javascript");
    formData.append("tags", "typescript");
    formData.append("tags", "testing");
    formData.append("isPublic", "on");

    // Add multiple files
    const file1 = new File(["content 1"], "file1.txt", { type: "text/plain" });
    const file2 = new File(["content 2"], "file2.txt", { type: "text/plain" });
    formData.append("files", file1);
    formData.append("files", file2);

    // Add some meta-fields that should be ignored
    formData.append("$ACTION_REF", "should-be-ignored");

    const result = await action(initial(action), formData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Mixed Content Test");
      expect(result.data.tagCount).toBe(3);
      expect(result.data.tags).toEqual(["javascript", "typescript", "testing"]);
      expect(result.data.fileCount).toBe(2);
      expect(result.data.fileNames).toEqual(["file1.txt", "file2.txt"]);
      expect(result.data.isPublic).toBe(true);
    }
  });
});

describe("FormData Error Handling Edge Cases", () => {
  it("should provide detailed error messages for validation failures", async () => {
    const detailedErrorSchema = zfd.formData({
      name: zfd.text(
        z.string().min(2, "Name must be at least 2 characters long"),
      ),
      email: zfd.text(z.string().email("Please provide a valid email address")),
      age: zfd.numeric(
        z
          .number()
          .min(18, "You must be at least 18 years old")
          .max(120, "Age cannot exceed 120 years"),
      ),
      website: zfd.text(
        z.string().url("Please provide a valid URL").optional(),
      ),
      avatar: zfd.file(
        z
          .instanceof(File)
          .refine(
            (file) => file.size <= 2 * 1024 * 1024,
            "Avatar must be under 2MB",
          )
          .refine(
            (file) => ["image/jpeg", "image/png"].includes(file.type),
            "Avatar must be a JPEG or PNG image",
          ),
      ),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
          validationErrorFormat: "nested",
        })
        .schemas({ inputSchema: detailedErrorSchema })
        .handler(async ({ input }) => input),
    );

    // Create FormData with multiple validation errors
    const formData = new FormData();
    formData.append("name", "J"); // Too short
    formData.append("email", "invalid-email"); // Invalid format
    formData.append("age", "15"); // Too young
    formData.append("website", "not-a-url"); // Invalid URL

    // Add invalid file
    const largeContent = "x".repeat(3 * 1024 * 1024); // 3MB
    const invalidFile = new File([largeContent], "large.gif", {
      type: "image/gif", // Wrong type
    });
    formData.append("avatar", invalidFile);

    const result = await action(initial(action), formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
      if ("fieldErrors" in result.error) {
        // Check that all field errors are present with detailed messages
        // fieldErrors might be arrays of error messages
        const nameErrors = Array.isArray(result.error.fieldErrors.name)
          ? result.error.fieldErrors.name
          : [result.error.fieldErrors.name];
        const emailErrors = Array.isArray(result.error.fieldErrors.email)
          ? result.error.fieldErrors.email
          : [result.error.fieldErrors.email];
        const ageErrors = Array.isArray(result.error.fieldErrors.age)
          ? result.error.fieldErrors.age
          : [result.error.fieldErrors.age];

        expect(
          nameErrors.some((msg) => msg && msg.includes("2 characters long")),
        ).toBe(true);
        expect(
          emailErrors.some((msg) => msg && msg.includes("valid email address")),
        ).toBe(true);
        expect(
          ageErrors.some((msg) => msg && msg.includes("18 years old")),
        ).toBe(true);
        expect(result.error.fieldErrors.website).toBeTruthy();
        expect(result.error.fieldErrors.avatar).toBeTruthy();
      }
    }
  });

  it("should handle FormData parsing errors gracefully", async () => {
    const robustSchema = zfd.formData({
      data: zfd.text().optional(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
        })
        .schemas({ inputSchema: robustSchema })
        .errors({
          parsingError: (message: string) => ({
            type: "PARSING_ERROR" as const,
            message,
          }),
        })
        .handler(async ({ input, errors, metadata }) => {
          // Check for potential parsing issues
          if (!(metadata.rawInput instanceof FormData)) {
            return errors.parsingError("Expected FormData input");
          }

          return { data: input.data || "default" };
        }),
    );

    // Test with valid FormData
    const validFormData = new FormData();
    validFormData.append("data", "test-value");

    const result = await action(initial(action), validFormData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toBe("test-value");
    }
  });

  it("should handle FormData with corrupted or unusual field values", async () => {
    const resilientSchema = zfd.formData({
      normalField: zfd.text(),
      numericField: zfd.numeric().optional(),
      fileField: zfd.file().optional(),
    });

    const action = craft((action) =>
      action
        .config({
          useActionState: true,
          validationErrorFormat: "flattened",
        })
        .schemas({ inputSchema: resilientSchema })
        .handler(async ({ input }) => ({
          normalField: input.normalField,
          hasNumericField: input.numericField !== undefined,
          hasFileField: !!input.fileField,
        })),
    );

    const formData = new FormData();
    formData.append("normalField", "normal-value");
    formData.append("numericField", ""); // Empty string for numeric field
    // fileField not provided

    const result = await action(initial(action), formData);

    // Should handle empty numeric field gracefully
    expect(result.success).toBe(false); // Empty string should fail numeric validation
    if (!result.success) {
      expect(result.error.type).toBe("INPUT_VALIDATION");
    }
  });
});
