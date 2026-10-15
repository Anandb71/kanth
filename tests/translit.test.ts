import { describe, expect, it } from "vitest";
import { hasRoman, splitPadding, translitBody, translitTarget } from "../server/translit.ts";

describe("transliteration helpers", () => {
  it("maps app languages to API targets", () => {
    expect(translitTarget("ta-IN")).toBe("ta-IN");
    expect(translitTarget("hi-IN")).toBe("hi-IN");
    expect(translitTarget("od-IN")).toBe("od-IN");
    expect(translitTarget("or-IN")).toBe("od-IN");
  });
  it("has no target for English or scripts the API cannot write", () => {
    expect(translitTarget("en-IN")).toBeUndefined();
    expect(translitTarget("as-IN")).toBeUndefined();
    expect(translitTarget("ur-IN")).toBeUndefined();
    expect(translitTarget("")).toBeUndefined();
  });
  it("only sends text that has Roman letters", () => {
    expect(hasRoman("amma charger edutthu vaa")).toBe(true);
    expect(hasRoman("அம்மா charger")).toBe(true);
    expect(hasRoman("அம்மா, சார்ஜர் எடுத்து வா")).toBe(false);
    expect(hasRoman("123 ?!")).toBe(false);
  });
  it("keeps the spacing the user typed", () => {
    expect(splitPadding("  amma vaa ")).toEqual({ lead: "  ", core: "amma vaa", trail: " " });
    expect(splitPadding("amma")).toEqual({ lead: "", core: "amma", trail: "" });
    expect(splitPadding("   ")).toEqual({ lead: "   ", core: "", trail: "" });
    expect(splitPadding("line one\nline two\n")).toEqual({ lead: "", core: "line one\nline two", trail: "\n" });
  });
  it("builds the verified request body", () => {
    expect(translitBody("amma vaa", "ta-IN")).toEqual({
      input: "amma vaa",
      source_language_code: "en-IN",
      target_language_code: "ta-IN",
      numerals_format: "international",
    });
  });
});
