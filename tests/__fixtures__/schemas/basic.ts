import { z } from "zod";

// ============================================================================
// BASIC INPUT SCHEMAS
// ============================================================================
// Simple schemas used for fundamental validation testing and basic workflows

/**
 * Type definitions derived from schemas - used throughout tests for type safety
 */
export type User = z.infer<typeof userSchema>;

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
