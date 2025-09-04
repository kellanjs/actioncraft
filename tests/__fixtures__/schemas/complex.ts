import { z } from "zod";

// ============================================================================
// COMPLEX & NESTED SCHEMAS
// ============================================================================
// Advanced schemas for testing complex data structures and validation scenarios

/**
 * Type definitions derived from schemas - used throughout tests for type safety
 */
export type NestedData = z.infer<typeof nestedSchema>;

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
// OUTPUT SCHEMAS
// ============================================================================
// Schemas for validating action outputs and return values

/**
 * Type definitions derived from schemas - used throughout tests for type safety
 */
export type UserOutput = z.infer<typeof userOutputSchema>;

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
// TEST DATA FIXTURES
// ============================================================================
// Pre-defined test data for consistent testing across different test suites

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
