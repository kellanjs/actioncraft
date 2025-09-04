import { expect } from "vitest";

/**
 * Shared test utilities for action/craft function testing
 * These helpers are used across multiple test files
 */

/**
 * Helper to verify that a function is created and is callable
 */
export function expectValidAction(action: any) {
  expect(action).toBeDefined();
  expect(typeof action).toBe("function");
}

/**
 * Helper to verify action result structure for success cases
 */
export function expectSuccessResult(result: any, expectedData: any) {
  expect(result).toEqual({
    success: true,
    data: expectedData,
    __ac_id: expect.any(String),
  });
}

/**
 * Helper to verify action result structure for error cases
 */
export function expectErrorResult(result: any, expectedError: any) {
  expect(result).toEqual({
    success: false,
    error: expectedError,
    __ac_id: expect.any(String),
  });
}

/**
 * Helper to verify action metadata is properly set
 */
export function expectActionMetadata(action: any) {
  expect((action as any).__ac_config).toBeDefined();
  expect((action as any).__ac_id).toBeDefined();
}

/**
 * Common error factories used across tests
 */
export const commonErrorFactories = {
  notFound: (id: string) => ({
    type: "NOT_FOUND" as const,
    message: `Item ${id} not found`,
  }),
  validation: (field: string) => ({
    type: "VALIDATION_ERROR" as const,
    message: `Invalid ${field}`,
  }),
  unauthorized: () => ({
    type: "UNAUTHORIZED" as const,
    message: "Access denied",
  }),
};

/**
 * Common test data used across multiple test files
 */
export const commonTestData = {
  validUser: {
    name: "John Doe",
    email: "john@example.com",
    age: 30,
  },
  validNumber: 21,
  expectedDoubled: 42,
  testString: "test",
  invalidString: "invalid",
};

/**
 * Helper to verify action ID is present and valid in results
 */
export function expectActionIdInResult(
  result: any,
  expectedActionId: string | undefined,
) {
  expect(expectedActionId).toBeDefined();
  expect(result.__ac_id).toBe(expectedActionId);
  expect(typeof result.__ac_id).toBe("string");
}

/**
 * Helper to verify action ID format and validity
 */
export function expectValidActionId(actionId: string | undefined) {
  expect(actionId).toBeDefined();
  expect(typeof actionId).toBe("string");
  expect(actionId!.length).toBeGreaterThan(0);

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  expect(actionId).toMatch(uuidRegex);
}
