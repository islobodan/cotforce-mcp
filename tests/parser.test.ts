import { parseCoT, extractBalancedJson, AgenticCotSchema } from "../src/lib/parser.js";

describe("extractBalancedJson", () => {
  it("extracts a simple object", () => {
    expect(extractBalancedJson('{"a": 1}')).toBe('{"a": 1}');
  });

  it("extracts nested objects", () => {
    const input = '{"outer": {"inner": 42}}';
    expect(extractBalancedJson(input)).toBe(input);
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{"reasoning": "He said \\"hello\\""}';
    expect(extractBalancedJson(input)).toBe(input);
  });

  it("ignores unbalanced braces", () => {
    expect(extractBalancedJson('{"a": 1')).toBeNull();
  });

  it("finds object within surrounding text", () => {
    const input = 'Some text before {"key": "value"} and after';
    expect(extractBalancedJson(input)).toBe('{"key": "value"}');
  });

  it("returns null when no object found", () => {
    expect(extractBalancedJson("no json here")).toBeNull();
  });

  it("handles multiple objects and returns first", () => {
    const input = '{"first": 1} {"second": 2}';
    expect(extractBalancedJson(input)).toBe('{"first": 1}');
  });

  it("handles braces inside strings without counting", () => {
    const input = '{"reasoning": "Use {curly} braces"}';
    expect(extractBalancedJson(input)).toBe(input);
  });

  it("handles deeply nested structures", () => {
    const input = '{"a":{"b":{"c":{"d":1}}}}';
    expect(extractBalancedJson(input)).toBe(input);
  });
});

describe("parseCoT - Layer 1: Direct JSON", () => {
  it("parses clean JSON", () => {
    const result = parseCoT('{"reasoning": "step one", "result": 42}');
    expect(result).toEqual({ reasoning: "step one", result: 42 });
  });

  it("parses JSON with code fences", () => {
    const result = parseCoT('```json\n{"reasoning": "step", "result": "x"}\n```');
    expect(result).toEqual({ reasoning: "step", result: "x" });
  });

  it("rejects empty reasoning", () => {
    const result = parseCoT('{"reasoning": "", "result": 42}');
    expect(result).toBeNull();
  });

  it("rejects missing reasoning field", () => {
    const result = parseCoT('{"result": 42}');
    expect(result).toBeNull();
  });

  it("rejects missing result field", () => {
    const result = parseCoT('{"reasoning": "step"}');
    expect(result).toBeNull();
  });

  it("accepts complex result types", () => {
    const result = parseCoT('{"reasoning": "steps", "result": {"nested": true, "items": [1,2,3]}}');
    expect(result).toEqual({
      reasoning: "steps",
      result: { nested: true, items: [1, 2, 3] },
    });
  });
});

describe("parseCoT - Layer 2: Markdown code blocks", () => {
  it("extracts JSON from fenced block", () => {
    const input = 'Here is my answer:\n\n```json\n{\n  "reasoning": "calculated",\n  "result": 100\n}\n```';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: "calculated", result: 100 });
  });

  it("handles fence without json label", () => {
    const input = '```\n{"reasoning": "r", "result": 1}\n```';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: "r", result: 1 });
  });

  it("returns null for invalid JSON inside fence", () => {
    const input = '```json\n{invalid}\n```';
    expect(parseCoT(input)).toBeNull();
  });
});

describe("parseCoT - Layer 3: XML / Label heuristics", () => {
  it("extracts from XML tags", () => {
    const input = '<reasoning>Step one and two</reasoning>\n<result>Final answer</result>';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: "Step one and two", result: "Final answer" });
  });

  it("extracts from Reasoning:/Result: labels", () => {
    const input = 'Reasoning: I thought about it\nResult: 42';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: "I thought about it", result: "42" });
  });

  it("handles multiline reasoning with labels", () => {
    const input = 'Reasoning: Line one\nLine two\nLine three\nResult: answer here';
    const result = parseCoT(input);
    expect(result).toEqual({
      reasoning: "Line one\nLine two\nLine three",
      result: "answer here",
    });
  });

  it("requires both reasoning and result", () => {
    expect(parseCoT("<reasoning>only reasoning</reasoning>")).toBeNull();
    expect(parseCoT("Result: only result")).toBeNull();
  });

  it("rejects empty reasoning from XML", () => {
    expect(parseCoT("<reasoning></reasoning>\n<result>x</result>")).toBeNull();
  });
});

describe("parseCoT - Layer 4: Brace balancing", () => {
  it("finds JSON object inside prose", () => {
    const input = 'Let me think... okay, here: {"reasoning": "thoughts", "result": 99} Done!';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: "thoughts", result: 99 });
  });

  it("finds nested JSON in prose", () => {
    const input = 'Answer: {"reasoning": "deep", "result": {"value": 7}}';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: "deep", result: { value: 7 } });
  });

  it("returns null if no valid JSON object found", () => {
    expect(parseCoT("no braces here at all")).toBeNull();
  });

  it("handles escaped quotes in brace-balanced extraction", () => {
    const input = '{"reasoning": "He said \\"hi\\"", "result": 1}';
    const result = parseCoT(input);
    expect(result).toEqual({ reasoning: 'He said "hi"', result: 1 });
  });
});

describe("parseCoT - Realistic LLM outputs", () => {
  it("handles JSON with leading whitespace", () => {
    const input = '   \n\n  {"reasoning": "r", "result": 1}';
    expect(parseCoT(input)).toEqual({ reasoning: "r", result: 1 });
  });

  it("handles JSON with trailing text", () => {
    const input = '{"reasoning": "r", "result": 1}\n\nHope that helps!';
    expect(parseCoT(input)).toEqual({ reasoning: "r", result: 1 });
  });

  it("handles mixed markdown and text", () => {
    const input = 'Here you go:\n\n```json\n{\n  "reasoning": "First I added 2+2=4, then I doubled it.",\n  "result": 8\n}\n```\n\nLet me know if you need more help!';
    expect(parseCoT(input)).toEqual({
      reasoning: "First I added 2+2=4, then I doubled it.",
      result: 8,
    });
  });

  it("handles result as array", () => {
    const input = '{"reasoning": "listed items", "result": ["a", "b", "c"]}';
    expect(parseCoT(input)).toEqual({
      reasoning: "listed items",
      result: ["a", "b", "c"],
    });
  });

  it("handles result as boolean", () => {
    const input = '{"reasoning": "evaluated", "result": false}';
    expect(parseCoT(input)).toEqual({ reasoning: "evaluated", result: false });
  });

  it("handles result as null", () => {
    const input = '{"reasoning": "nothing found", "result": null}';
    expect(parseCoT(input)).toEqual({ reasoning: "nothing found", result: null });
  });

  it("handles result as number zero", () => {
    const input = '{"reasoning": "subtracted", "result": 0}';
    expect(parseCoT(input)).toEqual({ reasoning: "subtracted", result: 0 });
  });

  it("rejects result as empty string with empty reasoning", () => {
    const input = '{"reasoning": "", "result": ""}';
    expect(parseCoT(input)).toBeNull();
  });
});

describe("parseCoT - Layer 5: Truncated JSON recovery", () => {
  it("recovers reasoning from truncated JSON (no result field)", () => {
    const input = '{"reasoning": "Step 1: I analyzed the problem. Step 2: I found the answer."';
    const result = parseCoT(input);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toContain("Step 1");
    expect(result!.result).toBeNull();
  });

  it("recovers reasoning when reasoning string itself is truncated", () => {
    const input = '{"reasoning": "Step 1: I analyzed the problem. Step 2: I was thinking about';
    const result = parseCoT(input);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toContain("Step 1");
    expect(result!.reasoning).toContain("[Response truncated]");
    expect(result!.result).toBeNull();
  });

  it("recovers reasoning and partial string result", () => {
    const input = '{"reasoning": "I solved it", "result": "the answer is';
    const result = parseCoT(input);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe("I solved it");
    expect(result!.result).toBe("the answer is");
  });

  it("recovers reasoning with number result", () => {
    const input = '{"reasoning": "I computed it", "result": 42';
    const result = parseCoT(input);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe("I computed it");
    expect(result!.result).toBe(42);
  });

  it("recovers reasoning when result object is truncated", () => {
    const input = '{"reasoning": "I built the object", "result": {"SEND": 9567, "MORE": 1085';
    const result = parseCoT(input);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe("I built the object");
    expect(result!.result).toBeNull(); // can't parse incomplete object
  });

  it("does not recover non-truncated valid JSON", () => {
    // This should be handled by Layer 1, not Layer 5
    const input = '{"reasoning": "step"}';
    expect(parseCoT(input)).toBeNull();
  });

  it("recovers from realistic truncated SEND+MORE response", () => {
    const input = '{"reasoning": "Step 1: M must be 1. Step 2: O must be 0. Step 3: S=9, R=8, E=5, N=6, D=7, Y=2."';
    const result = parseCoT(input);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toContain("M must be 1");
    expect(result!.result).toBeNull();
  });
});

describe("AgenticCotSchema", () => {
  it("validates correct structure", () => {
    const result = AgenticCotSchema.safeParse({
      reasoning: "step by step",
      result: 42,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing reasoning", () => {
    const result = AgenticCotSchema.safeParse({ result: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects empty reasoning", () => {
    const result = AgenticCotSchema.safeParse({ reasoning: "", result: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects non-string reasoning", () => {
    const result = AgenticCotSchema.safeParse({ reasoning: 123, result: 42 });
    expect(result.success).toBe(false);
  });

  it("accepts any result type except undefined", () => {
    expect(AgenticCotSchema.safeParse({ reasoning: "r", result: null }).success).toBe(true);
    expect(AgenticCotSchema.safeParse({ reasoning: "r", result: [] }).success).toBe(true);
    expect(AgenticCotSchema.safeParse({ reasoning: "r", result: {} }).success).toBe(true);
    expect(AgenticCotSchema.safeParse({ reasoning: "r", result: 0 }).success).toBe(true);
    expect(AgenticCotSchema.safeParse({ reasoning: "r", result: "" }).success).toBe(true);
    expect(AgenticCotSchema.safeParse({ reasoning: "r", result: undefined }).success).toBe(false);
  });
});
