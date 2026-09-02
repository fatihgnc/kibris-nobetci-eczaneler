// A string from a query parameter becomes CSS. Only a hex colour may survive.
import { describe, expect, it } from "vitest";
import { parseAccent } from "../embed-accent";

describe("parseAccent", () => {
  it("accepts six-digit hex with or without the hash", () => {
    expect(parseAccent("#1550A8")).toBe("#1550a8");
    expect(parseAccent("1550a8")).toBe("#1550a8");
  });

  it("expands three-digit hex", () => {
    expect(parseAccent("#c30")).toBe("#cc3300");
  });

  it("takes the first value when the parameter repeats", () => {
    expect(parseAccent(["#abcdef", "#000000"])).toBe("#abcdef");
  });

  it("rejects everything that is not a hex colour", () => {
    for (const bad of ["", "   ", "red", "#12345", "#1234567", "#gggggg", "url(x)", "#fff;}body{", undefined, null]) {
      expect(parseAccent(bad)).toBeNull();
    }
  });
});
