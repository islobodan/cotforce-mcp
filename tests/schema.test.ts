import { validateResultSchema } from "../src/index.js";

describe("validateResultSchema", () => {
  it("validates matching types", () => {
    const result = validateResultSchema(
      { name: "Alice", age: 30 },
      { name: "string", age: "number" }
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing keys", () => {
    const result = validateResultSchema(
      { name: "Alice" },
      { name: "string", age: "number" }
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('"age"');
  });

  it("rejects wrong types", () => {
    const result = validateResultSchema(
      { name: "Alice", age: "thirty" },
      { name: "string", age: "number" }
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("age");
    expect(result.error).toContain("number");
  });

  it("rejects non-object result", () => {
    expect(validateResultSchema("hello", { name: "string" }).valid).toBe(false);
    expect(validateResultSchema(42, { name: "string" }).valid).toBe(false);
    expect(validateResultSchema(null, { name: "string" }).valid).toBe(false);
    expect(validateResultSchema([], { name: "string" }).valid).toBe(false);
  });

  it("validates nested objects", () => {
    const result = validateResultSchema(
      { user: { name: "Bob", age: 25 } },
      { user: { name: "string", age: "number" } }
    );
    expect(result.valid).toBe(true);
  });

  it("rejects nested type mismatch", () => {
    const result = validateResultSchema(
      { user: { name: "Bob", age: "twenty" } },
      { user: { name: "string", age: "number" } }
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("user");
  });

  it("accepts extra keys not in schema", () => {
    const result = validateResultSchema(
      { name: "Alice", age: 30, extra: true },
      { name: "string", age: "number" }
    );
    expect(result.valid).toBe(true);
  });

  it("validates boolean type", () => {
    expect(
      validateResultSchema({ active: true }, { active: "boolean" }).valid
    ).toBe(true);
    expect(
      validateResultSchema({ active: "yes" }, { active: "boolean" }).valid
    ).toBe(false);
  });
});
