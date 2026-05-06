import { isDirectModeConfigured } from "../src/lib/llm.js";

describe("isDirectModeConfigured", () => {
  const originalKey = process.env.API_KEY;
  const originalMode = process.env.MODE;
  const originalUrl = process.env.API_BASE_URL;

  afterEach(() => {
    if (originalKey !== undefined) process.env.API_KEY = originalKey;
    else delete process.env.API_KEY;
    if (originalMode !== undefined) process.env.MODE = originalMode;
    else delete process.env.MODE;
    if (originalUrl !== undefined) process.env.API_BASE_URL = originalUrl;
    else delete process.env.API_BASE_URL;
  });

  it("returns false when nothing is set (auto mode)", () => {
    delete process.env.API_KEY;
    delete process.env.MODE;
    delete process.env.API_BASE_URL;
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

  it("returns true when MODE=direct even without API_KEY", () => {
    delete process.env.API_KEY;
    process.env.MODE = "direct";
    expect(isDirectModeConfigured()).toBe(true);
  });

  it("returns false when MODE=sampling even with API_KEY", () => {
    process.env.API_KEY = "sk-test123";
    process.env.MODE = "sampling";
    expect(isDirectModeConfigured()).toBe(false);
  });

  it("returns true when API_BASE_URL is set (local endpoint)", () => {
    delete process.env.API_KEY;
    process.env.API_BASE_URL = "http://localhost:1234/v1";
    expect(isDirectModeConfigured()).toBe(true);
  });
});
