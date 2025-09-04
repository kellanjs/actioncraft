import { z } from "zod";

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
