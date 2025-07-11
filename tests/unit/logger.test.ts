import { create } from "../../src/actioncraft";
import { describe, it, expect, vi } from "vitest";

describe("Logger Configuration", () => {
  it("should be silent by default", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const action = create()
      .callbacks({
        onSuccess: () => {
          throw new Error("Callback error");
        },
      })
      .action(async () => "success")
      .craft();

    await action();

    // No console.error should have been called
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should call logger when provided", async () => {
    const mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
    };

    // First, let's verify the logger config is accepted without errors
    const action = create({ logger: mockLogger })
      .action(async () => "success")
      .craft();

    const result = await action();
    expect(result).toEqual({ success: true, data: "success" });

    // The logger should be configured but not called for successful operations
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("should handle logger with missing methods gracefully", async () => {
    const mockLogger = {}; // Empty logger

    const action = create({ logger: mockLogger })
      .action(async () => "success")
      .craft();

    // Should not throw and should work normally
    const result = await action();
    expect(result).toEqual({ success: true, data: "success" });
  });

  it("should log error handling failures", async () => {
    const mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
    };

    const action = create({
      logger: mockLogger,
      handleThrownError: () => {
        throw new Error("Error handler also throws");
      },
    })
      .action(async () => {
        throw new Error("Primary error");
      })
      .craft();

    await action();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Error handling failure - both primary error and error handler threw",
      {
        primaryError: expect.any(Error),
        handlerError: expect.any(Error),
      },
    );
  });

  it("should not log when logger methods are undefined", async () => {
    const mockLogger = {
      error: undefined,
      warn: undefined,
    };

    const action = create({ logger: mockLogger })
      .action(async () => "success")
      .craft();

    // Should not throw and should not attempt to call undefined methods
    const result = await action();
    expect(result).toEqual({ success: true, data: "success" });
  });

  it("should accept logger configuration in type system", () => {
    // This test just verifies the types work correctly
    const logger = {
      error: (message: string, details?: unknown) => {
        console.error(message, details);
      },
      warn: (message: string, details?: unknown) => {
        console.warn(message, details);
      },
    };

    const action = create({
      logger,
      resultFormat: "api" as const,
      validationErrorFormat: "flattened" as const,
    })
      .action(async () => "success")
      .craft();

    expect(action).toBeDefined();
    expect(typeof action).toBe("function");
  });

  it("should log callback errors via logger.error", async () => {
    const mockLogger = { error: vi.fn(), warn: vi.fn() };

    const action = create({ logger: mockLogger })
      .action(async () => "success")
      .callbacks({
        onSuccess: () => {
          throw new Error("Callback failure");
        },
      })
      .craft();

    await action();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error in onSuccess callback",
      expect.any(Error),
    );
  });
});
