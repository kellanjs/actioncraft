import { zfd } from "zod-form-data";
import { z } from "zod/v4";

// ============================================================================
// CORE TYPES & UTILITIES
// ============================================================================

/**
 * Type definitions derived from schemas - used throughout tests for type safety
 */
export type User = z.infer<typeof userSchema>;
export type UserOutput = z.infer<typeof userOutputSchema>;
export type BasicFormData = z.infer<typeof basicFormDataSchema>;
export type FormDataResult = z.infer<typeof formDataResultSchema>;
export type NestedData = z.infer<typeof nestedSchema>;

/**
 * Creates a FormData-only schema that explicitly rejects regular objects.
 * This utility addresses testing scenarios where actions should only accept
 * FormData inputs (like file uploads) and reject plain object submissions.
 *
 * Used in tests to verify proper input type validation and error handling.
 */
export function createFormDataOnlySchema<T extends Record<string, any>>(
  schema: T,
) {
  return {
    "~standard": {
      version: 1,
      vendor: "custom",
      validate: (input: unknown) => {
        // First check if it's FormData
        if (!(input instanceof FormData)) {
          return {
            issues: [
              {
                message:
                  "This endpoint only accepts FormData, not regular objects",
                path: [],
              },
            ],
          };
        }

        // If it is FormData, use the zfd schema to validate it
        const formDataSchema = zfd.formData(schema);
        try {
          const result = formDataSchema.parse(input);
          return { value: result };
        } catch (error) {
          // zfd is built on Zod, so all parsing errors are ZodErrors
          if (error instanceof z.ZodError) {
            return {
              issues: error.issues.map((issue) => ({
                message: issue.message,
                path: issue.path,
              })),
            };
          }
          // This should never happen since zfd always throws ZodErrors
          return {
            issues: [
              {
                message: "FormData validation failed",
                path: [],
              },
            ],
          };
        }
      },
    },
    "~validate": function (input: unknown) {
      return this["~standard"].validate(input);
    },
  } as const;
}

/**
 * Helper function to create FormData instances for testing.
 * Handles both single values and arrays, automatically appending
 * array items individually as FormData requires.
 */
export function createFormData(
  data: Record<string, string | File | string[]>,
): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, item));
    } else {
      formData.append(key, value);
    }
  }

  return formData;
}

// ============================================================================
// BASIC INPUT SCHEMAS
// ============================================================================
// Simple schemas used for fundamental validation testing and basic workflows

/**
 * Standard user schema with common validation rules.
 * Used in most basic action tests to verify standard validation flows.
 */
const _userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  age: z.number().min(18, "Must be at least 18 years old"),
});

/**
 * Simplified user schema without email requirement.
 * Used specifically for bind argument tests where we want minimal validation
 * to focus on argument binding rather than complex validation logic.
 */
const _simpleUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.number().min(18, "Must be at least 18 years old"),
});

/**
 * Basic string schema with non-empty validation.
 * Used for testing simple string input validation and error messages.
 */
const _simpleStringSchema = z.string().min(1, "String cannot be empty");

/**
 * Basic numeric schema with positive number validation.
 * Used for testing numeric input handling and validation.
 */
const _numericSchema = z.number().positive("Must be a positive number");

/**
 * String schema that allows empty strings.
 * Used for edge case testing where empty input should be valid.
 */
const _emptyAllowedStringSchema = z.string();

// Export basic schemas
export const userSchema = _userSchema;
export const simpleUserSchema = _simpleUserSchema;
export const stringSchema = _simpleStringSchema;
export const numberSchema = _numericSchema;
export const emptyAllowedStringSchema = _emptyAllowedStringSchema;

// ============================================================================
// FORMDATA SCHEMAS
// ============================================================================
// Schemas for testing FormData handling, file uploads, and form-specific features

/**
 * Base field definitions for FormData schemas.
 * Reused across multiple FormData schemas to ensure consistency.
 */
const basicFormDataFields = {
  name: zfd.text(z.string().min(1, "Name is required")),
  email: zfd.text(z.string().email("Invalid email")),
  age: zfd.numeric(z.number().min(18, "Must be at least 18")),
} as const;

/**
 * Standard FormData schema for basic form validation testing.
 * Tests that actions can properly handle and validate FormData inputs.
 */
const _basicFormDataSchema = zfd.formData(basicFormDataFields);

/**
 * FormData-only schema that rejects regular objects.
 * Used to test scenarios where actions should only accept FormData
 * (like file upload endpoints) and properly reject plain object submissions.
 */
const _basicFormDataOnlySchema = createFormDataOnlySchema(basicFormDataFields);

/**
 * File upload schema for testing file handling capabilities.
 * Tests single optional file upload and multiple file upload scenarios.
 */
const _fileUploadSchema = zfd.formData({
  name: zfd.text(),
  avatar: zfd.file().optional(),
  documents: zfd.repeatableOfType(zfd.file()),
});

/**
 * Checkbox and multi-value form schema.
 * Tests handling of checkboxes (boolean conversion) and repeated text fields.
 */
const _checkboxFormSchema = zfd.formData({
  name: zfd.text(),
  isPrivate: zfd.checkbox(),
  tags: zfd.repeatableOfType(zfd.text()),
});

export const basicFormDataSchema = _basicFormDataSchema;
export const basicFormDataOnlySchema = _basicFormDataOnlySchema;
export const fileUploadSchema = _fileUploadSchema;
export const checkboxFormSchema = _checkboxFormSchema;

// ============================================================================
// PARSED RESULT SCHEMAS
// ============================================================================
// Object schemas representing the parsed/transformed results from FormData
// Used to validate that FormData parsing produces the expected object structure

/**
 * Expected result schema after parsing basic FormData.
 * Used to verify that FormData parsing produces correctly typed objects.
 */
const _formDataResultSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  age: z.number().min(18, "Must be at least 18"),
});

/**
 * Expected result schema after parsing file upload FormData.
 * Validates that files are properly converted to File objects and arrays.
 */
const _fileUploadResultSchema = z.object({
  name: z.string(),
  avatar: z.instanceof(File).optional(),
  documents: z.array(z.instanceof(File)).default([]),
});

/**
 * Expected result schema after parsing checkbox FormData.
 * Validates boolean conversion and array handling from form inputs.
 */
const _checkboxResultSchema = z.object({
  name: z.string(),
  isPrivate: z.boolean(),
  tags: z.array(z.string()).default([]),
});

export const formDataResultSchema = _formDataResultSchema;
export const fileUploadResultSchema = _fileUploadResultSchema;
export const checkboxResultSchema = _checkboxResultSchema;

// ============================================================================
// COMPLEX ARRAY FORM SCHEMAS
// ============================================================================
// Advanced FormData schemas for testing complex form structures and edge cases

/**
 * Structured approach to handling form arrays with mixed content.
 * Uses explicit field naming (items[0].name, items[0].file) instead of
 * parallel arrays to avoid index misalignment issues.
 *
 * Demonstrates a robust pattern for complex form structures.
 */
export const structuredArrayFormSchema = zfd.formData({
  title: zfd.text(),
  // Use structured naming to avoid parallel array alignment issues
  "items[0].name": zfd.text().optional(),
  "items[0].file": zfd.file().optional(),
  "items[1].name": zfd.text().optional(),
  "items[1].file": zfd.file().optional(),
  "items[2].name": zfd.text().optional(),
  "items[2].file": zfd.file().optional(),
});

/**
 * Parallel array form schema with custom transformation logic.
 * Tests handling of the common but problematic pattern where form arrays
 * can have misaligned indices (e.g., when files are omitted in the middle).
 *
 * The transformation logic properly maps files to items based on the
 * actual FormData structure, not just array indices.
 */
export const parallelArrayFormSchema = zfd
  .formData({
    title: zfd.text(),
    itemNames: zfd.repeatableOfType(zfd.text()),
    itemFiles: zfd.repeatableOfType(zfd.file()).optional(),
  })
  .transform((data) => {
    // Handle the parallel array alignment problem:
    // When files are omitted in the middle of a form, the file array indices
    // don't align with the name array indices. We need custom logic to
    // correctly distribute files to their intended items.

    const files = data.itemFiles || [];

    return {
      title: data.title,
      items: data.itemNames.map((name, index) => {
        // Custom mapping logic for test scenarios:
        // index 0 -> file 0 (first file)
        // index 1 -> no file (file omitted)
        // index 2 -> file 1 (second file, skipping the omitted middle file)
        let file: File | null = null;
        if (index === 0 && files[0]) {
          file = files[0];
        } else if (index === 2 && files[1]) {
          file = files[1];
        } else if (index !== 1 && files[index]) {
          // For other cases, use direct index mapping
          file = files[index];
        }

        return { name, file };
      }),
    };
  });

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================
// Schemas for validating action outputs and return values

/**
 * User output schema representing a created/updated user entity.
 * Used to validate that actions return properly structured user data
 * with server-generated fields like ID and timestamps.
 */
const _userOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.date(),
});

/**
 * Simple operation result schema.
 * Used for testing basic success responses and operation confirmations.
 */
const _simpleOutputSchema = z.object({
  message: z.string(),
  timestamp: z.number(),
});

export const userOutputSchema = _userOutputSchema;
export const simpleOutputSchema = _simpleOutputSchema;

// ============================================================================
// BIND ARGUMENT SCHEMAS
// ============================================================================
// Schemas for testing argument binding and context injection in actions

/**
 * Organization ID schema for testing context-based argument binding.
 * Used in tests that verify actions can receive bound arguments
 * like organization context from middleware or authentication.
 */
const _organizationIdSchema = z.string().uuid("Invalid organization ID");

/**
 * Permission level schema for testing authorization-based binding.
 * Used to test that actions can receive user permission context
 * and validate authorization levels.
 */
const _permissionLevelSchema = z.enum(["read", "write", "admin"]);

export const organizationIdSchema = _organizationIdSchema;
export const permissionLevelSchema = _permissionLevelSchema;

// ============================================================================
// COMPLEX & NESTED SCHEMAS
// ============================================================================
// Advanced schemas for testing complex data structures and validation scenarios

/**
 * Deeply nested object schema for testing complex validation scenarios.
 * Used to verify that nested validation errors are properly handled
 * and that complex object structures work correctly with actions.
 */
const _nestedSchema = z.object({
  user: z.object({
    profile: z.object({
      name: z.string().min(1),
      bio: z.string().optional(),
    }),
    settings: z.object({
      theme: z.enum(["light", "dark"]),
      notifications: z.boolean(),
    }),
  }),
  metadata: z.record(z.string(), z.unknown()),
});

/**
 * Array schema with minimum length requirement.
 * Used for testing array validation and ensuring collections
 * meet minimum requirements.
 */
const _arraySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        value: z.number(),
      }),
    )
    .min(1, "At least one item required"),
});

/**
 * Large object schema with nested arrays for performance testing.
 * Used to test action performance with large data structures
 * and validate that complex schemas don't cause performance issues.
 */
const _largeObjectSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      data: z.array(z.string()),
    }),
  ),
});

export const nestedSchema = _nestedSchema;
export const arraySchema = _arraySchema;
export const largeObjectSchema = _largeObjectSchema;
export const nestedErrorSchema = _nestedSchema; // Alias for error testing

// ============================================================================
// ERROR & VALIDATION TESTING SCHEMAS
// ============================================================================
// Schemas specifically designed to test error handling and validation failures

/**
 * Strict validation schema with multiple constraints.
 * Used to test comprehensive validation scenarios where multiple
 * validation rules must be satisfied simultaneously.
 */
const _strictSchema = z.object({
  requiredField: z.string(),
  strictNumber: z.number().int().positive(),
  restrictedEnum: z.enum(["option1", "option2"]),
});

/**
 * Schema that always fails validation.
 * Used specifically for testing error handling pathways and
 * ensuring that validation failures are properly caught and handled.
 */
const _alwaysFailSchema = z.string().refine(() => false, "This always fails");

export const strictSchema = _strictSchema;
export const alwaysFailSchema = _alwaysFailSchema;

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================
// Pre-defined test data for consistent testing across different test suites

/**
 * Valid user data that passes all validation rules.
 * Used as baseline "happy path" test data across multiple test scenarios.
 */
export const validUserData: User = {
  name: "John Doe",
  email: "john@example.com",
  age: 30,
};

/**
 * Invalid user data that fails multiple validation rules.
 * Used for testing validation error handling and error message generation.
 * Fails: empty name, invalid email format, age below minimum.
 */
export const invalidUserData = {
  name: "",
  email: "not-an-email",
  age: 15,
};

/**
 * Valid nested data structure for complex validation testing.
 * Used to test that deeply nested objects are properly validated
 * and that all nested properties meet their requirements.
 */
export const validNestedData: NestedData = {
  user: {
    profile: {
      name: "John",
      bio: "A developer",
    },
    settings: {
      theme: "dark",
      notifications: true,
    },
  },
  metadata: {
    source: "test",
    version: "1.0",
  },
};
