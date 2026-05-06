import { isDirectModeConfigured } from "../src/lib/llm.js";

describe("isDirectModeConfigured", () => {
  const original = process.env.API_KEY;

  afterEach(() => {
    if (original !== undefined) {
      process.env.API_KEY = original;
    } else {
      delete process.env.API_KEY;
    }
  });

  it("returns false when API_KEY is not set", () => {
    delete process.env.API_KEY;
    expect(isDirectModeConfigured()).toBe(false);
  });

  it("returns true when API_KEY is set", () => {
    process.env.API_KEY = "sk-test123";
    expect(isDirectModeConfigured()).toBe(true);
  });

  it("returns false for empty API_KEY", () => {
    process.env.API_KEY = "";
    expect(isDirectModeConfigured()).toBe(false);
  });
});
