import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Next.js unstable_rethrow since we're in a Node environment
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn((_error: unknown) => {
    // In the test environment, we don't have actual Next.js navigation errors
    // that need to be rethrown (like redirect() or notFound() calls).
    // This mock acts as a no-op for regular application errors during testing.
    // In production, unstable_rethrow would rethrow navigation-specific errors
    // while allowing other errors to be handled normally.
    return;
  }),
}));

// Common test utilities
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Mock fetch for tests that might use it
(globalThis as any).fetch = vi.fn();

// Export common testing functions for reuse
export { describe, expect, it, vi, beforeEach };
