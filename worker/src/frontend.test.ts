import { describe, it, expect } from "bun:test";
import { escAttr } from "./frontend";

describe("escAttr", () => {
  it("should escape ampersands", () => {
    expect(escAttr("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("should escape double quotes", () => {
    expect(escAttr('She said "hello"')).toBe("She said &quot;hello&quot;");
  });

  it("should escape angle brackets", () => {
    expect(escAttr("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("should escape all special characters together", () => {
    expect(escAttr('A & B "in" <tag>')).toBe("A &amp; B &quot;in&quot; &lt;tag&gt;");
  });

  it("should handle empty string", () => {
    expect(escAttr("")).toBe("");
  });

  it("should pass through safe strings unchanged", () => {
    expect(escAttr("Hello World")).toBe("Hello World");
  });

  it("should handle unicode characters", () => {
    expect(escAttr("Beyoncé • Jay-Z")).toBe("Beyoncé • Jay-Z");
  });
});
