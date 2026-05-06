import {
  getSystemPrompt,
  AGENTIC_SYSTEM_PROMPT,
  CLAUDE_SYSTEM_PROMPT,
  GPT4_SYSTEM_PROMPT,
  GEMINI_SYSTEM_PROMPT,
  GROK_SYSTEM_PROMPT,
} from "../src/lib/prompts.js";

describe("getSystemPrompt", () => {
  it("returns default prompt when model is not set", () => {
    expect(getSystemPrompt()).toBe(AGENTIC_SYSTEM_PROMPT);
    expect(getSystemPrompt("")).toBe(AGENTIC_SYSTEM_PROMPT);
  });

  it("returns default prompt for unknown model", () => {
    expect(getSystemPrompt("unknown-model-123")).toBe(AGENTIC_SYSTEM_PROMPT);
  });

  it("selects Claude prompt for Claude variants", () => {
    expect(getSystemPrompt("claude")).toBe(CLAUDE_SYSTEM_PROMPT);
    expect(getSystemPrompt("claude-3")).toBe(CLAUDE_SYSTEM_PROMPT);
    expect(getSystemPrompt("claude-3-5-sonnet")).toBe(CLAUDE_SYSTEM_PROMPT);
    expect(getSystemPrompt("claude-3-opus")).toBe(CLAUDE_SYSTEM_PROMPT);
  });

  it("selects Claude prompt case-insensitively", () => {
    expect(getSystemPrompt("Claude-3-5-Sonnet")).toBe(CLAUDE_SYSTEM_PROMPT);
    expect(getSystemPrompt("CLAUDE")).toBe(CLAUDE_SYSTEM_PROMPT);
  });

  it("selects GPT-4 prompt for GPT variants", () => {
    expect(getSystemPrompt("gpt-4")).toBe(GPT4_SYSTEM_PROMPT);
    expect(getSystemPrompt("gpt-4o")).toBe(GPT4_SYSTEM_PROMPT);
    expect(getSystemPrompt("gpt-4o-mini")).toBe(GPT4_SYSTEM_PROMPT);
    expect(getSystemPrompt("gpt-4-turbo")).toBe(GPT4_SYSTEM_PROMPT);
    expect(getSystemPrompt("gpt4")).toBe(GPT4_SYSTEM_PROMPT);
  });

  it("selects Gemini prompt for Gemini variants", () => {
    expect(getSystemPrompt("gemini")).toBe(GEMINI_SYSTEM_PROMPT);
    expect(getSystemPrompt("gemini-1-5-pro")).toBe(GEMINI_SYSTEM_PROMPT);
    expect(getSystemPrompt("gemini-1-5-flash")).toBe(GEMINI_SYSTEM_PROMPT);
  });

  it("selects Grok prompt for Grok variants", () => {
    expect(getSystemPrompt("grok")).toBe(GROK_SYSTEM_PROMPT);
    expect(getSystemPrompt("grok-2")).toBe(GROK_SYSTEM_PROMPT);
    expect(getSystemPrompt("grok-beta")).toBe(GROK_SYSTEM_PROMPT);
  });

  it("trims whitespace from model name", () => {
    expect(getSystemPrompt("  gpt-4  ")).toBe(GPT4_SYSTEM_PROMPT);
  });

  it("all prompts contain reasoning and result fields", () => {
    const prompts = [
      AGENTIC_SYSTEM_PROMPT,
      CLAUDE_SYSTEM_PROMPT,
      GPT4_SYSTEM_PROMPT,
      GEMINI_SYSTEM_PROMPT,
      GROK_SYSTEM_PROMPT,
    ];
    prompts.forEach((prompt) => {
      expect(prompt).toContain("reasoning");
      expect(prompt).toContain("result");
      expect(prompt).toContain("JSON");
    });
  });

  it("all prompts contain correct/incorrect examples", () => {
    const prompts = [
      AGENTIC_SYSTEM_PROMPT,
      CLAUDE_SYSTEM_PROMPT,
      GPT4_SYSTEM_PROMPT,
      GEMINI_SYSTEM_PROMPT,
      GROK_SYSTEM_PROMPT,
    ];
    prompts.forEach((prompt) => {
      expect(prompt).toContain("✅ Correct Example");
      expect(prompt).toContain("❌ Incorrect Example");
    });
  });
});
