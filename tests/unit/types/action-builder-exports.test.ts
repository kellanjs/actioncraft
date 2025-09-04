import { action } from "../../../src/index";
import { describe, expect, it } from "../../setup";

describe("ActionBuilder Exports", () => {
  it("should export action function from main index", () => {
    expect(action).toBeDefined();
    expect(typeof action).toBe("function");
  });

  it("should create ActionBuilder instance from exported function", () => {
    const builder = action();
    expect(builder).toBeDefined();
    expect(typeof builder.config).toBe("function");
    expect(typeof builder.schemas).toBe("function");
    expect(typeof builder.errors).toBe("function");
    expect(typeof builder.handler).toBe("function");
    expect(typeof builder.callbacks).toBe("function");
    expect(typeof builder.craft).toBe("function");
  });

  it("should create working action from exported function", async () => {
    const craftedAction = action()
      .handler(async () => "Hello from ActionBuilder!")
      .craft();

    const result = await craftedAction();
    expect(result).toEqual({
      success: true,
      data: "Hello from ActionBuilder!",
      __ac_id: expect.any(String),
    });
  });
});
