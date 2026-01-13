import { actioncraft } from "../../../src/index";
import { describe, it, expect } from "vitest";

describe("ActionBuilder Exports", () => {
  it("should export actioncraft function from main index", () => {
    expect(actioncraft).toBeDefined();
    expect(typeof actioncraft).toBe("function");
  });

  it("should create ActioncraftBuilder instance from exported function", () => {
    const builder = actioncraft();
    expect(builder).toBeDefined();
    expect(typeof builder.config).toBe("function");
    expect(typeof builder.schemas).toBe("function");
    expect(typeof builder.errors).toBe("function");
    expect(typeof builder.handler).toBe("function");
    expect(typeof builder.callbacks).toBe("function");
    expect(typeof builder.build).toBe("function");
  });

  it("should create working action from exported function", async () => {
    const craftedAction = actioncraft()
      .handler(async () => "Hello from ActionBuilder!")
      .build();

    const result = await craftedAction();
    expect(result).toEqual({
      success: true,
      data: "Hello from ActionBuilder!",
      __ac_id: expect.any(String),
    });
  });
});
