import { z } from "zod";
import { zfd } from "zod-form-data";

// ============================================================================
// CORE TYPES & UTILITIES
// ============================================================================

/**
 * Type definitions derived from schemas - used throughout tests for type safety
 */
export type BasicFormData = z.infer<typeof basicFormDataSchema>;
export type FormDataResult = z.infer<typeof formDataResultSchema>;

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
