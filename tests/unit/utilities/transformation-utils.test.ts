import { UNHANDLED_ERROR } from "../../../src/classes/executor/errors";
import {
  serializeRawInput,
  convertToClientError,
} from "../../../src/classes/executor/transformation";
import { INTERNAL_ERROR_TYPES } from "../../../src/types/errors";
import { describe, it, expect } from "../../setup";

// -----------------------------------------------------------------------------
// serializeRawInput
// -----------------------------------------------------------------------------

describe("serializeRawInput", () => {
  it("should flatten FormData correctly, collapsing single-value arrays", () => {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("tags", "ts");
    fd.append("tags", "js");
    fd.append("tags", "zod");
    fd.append(
      "avatar",
      new File(["file"], "avatar.png", { type: "image/png" }),
    );
    fd.append("$ACTION_ID", "should-be-ignored");

    const out = serializeRawInput(fd);

    expect(out).toEqual({
      name: "Alice",
      tags: ["ts", "js", "zod"],
      avatar: "avatar.png",
    });
  });

  it("should return non-FormData inputs unchanged", () => {
    const obj = { a: 1, b: "test" } as const;
    expect(serializeRawInput(obj)).toBe(obj);
  });
});

// -----------------------------------------------------------------------------
// convertToClientError
// -----------------------------------------------------------------------------

describe("convertToClientError", () => {
  it("should map internal OUTPUT_VALIDATION errors to UNHANDLED", () => {
    const internalErr = {
      type: INTERNAL_ERROR_TYPES.OUTPUT_VALIDATION,
      message: "Internal output validation failed",
      issues: [],
    } as const;

    const clientErr = convertToClientError(internalErr);
    expect(clientErr).toBe(UNHANDLED_ERROR);
  });

  it("should pass through external/custom errors unchanged", () => {
    const customErr = {
      type: "CUSTOM_ERROR",
      message: "Something bad happened",
    } as const;

    const out = convertToClientError(customErr);
    expect(out).toBe(customErr);
  });
});
