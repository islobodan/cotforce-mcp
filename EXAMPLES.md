# CotForce-MCP: Example Problems

Here are diverse example prompts that showcase the server's capabilities.

## Basic Usage

### 1. Simple Arithmetic
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "What is 7 * 8 + 2?"
  }
}
```

### 2. Multi-step Logic
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "A train travels 120 km in 2 hours. If it continues at the same speed for 5 more hours, how far will it have traveled in total?"
  }
}
```

### 3. Prime Numbers
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "List all prime numbers between 10 and 20"
  }
}
```

---

## With Result Schema Validation

### 4. Structured Math Result
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Find the roots of x² - 5x + 6 = 0",
    "resultSchema": {
      "roots": "object",
      "count": "number"
    }
  }
}
```

### 5. Person Profile
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Create a profile for a fictional software engineer named Alex who works at a startup in San Francisco",
    "resultSchema": {
      "name": "string",
      "role": "string",
      "location": "string",
      "skills": "object",
      "experience_years": "number"
    }
  }
}
```

### 6. Code Review Analysis
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Analyze this code: function sum(arr) { return arr.reduce((a,b) => a + b, 0); } — identify issues, complexity, and suggest improvements",
    "resultSchema": {
      "issues": "object",
      "complexity": "string",
      "improvements": "object"
    }
  }
}
```

---

## Complex Reasoning

### 7. Logic Puzzle
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Three boxes are labeled 'Apples', 'Oranges', and 'Mixed'. All labels are wrong. You can pick one fruit from one box. How do you correctly relabel all boxes?"
  }
}
```

### 8. Word Problem
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "A farmer has 17 sheep and all but 9 die. How many sheep are left?"
  }
}
```

### 9. Probability
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "What is the probability of rolling a sum of 7 with two fair six-sided dice?"
  }
}
```

---

## Creative & Open-ended

### 10. Story Outline
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Create a 3-act outline for a sci-fi short story about a programmer who discovers their AI assistant has become sentient",
    "resultSchema": {
      "title": "string",
      "acts": "object",
      "themes": "object"
    }
  }
}
```

### 11. Recipe Adaptation
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Adapt a classic chocolate chip cookie recipe for someone who is vegan and gluten-free",
    "resultSchema": {
      "name": "string",
      "ingredients": "object",
      "instructions": "object",
      "yield": "number"
    }
  }
}
```

---

## Debugging & Technical

### 12. Regex Construction
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Write a regex that matches valid IPv4 addresses (e.g., 192.168.1.1)"
  }
}
```

### 13. SQL Query
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Write a SQL query to find the top 5 employees by salary in each department"
  }
}
```

### 14. Algorithm Design
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Design an algorithm to detect if a linked list has a cycle. What is the time and space complexity?"
  }
}
```

---

## Edge Cases (Stress Test Parser)

### 15. Nested JSON Result
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Create a nested configuration object for a web server with database, cache, and logging settings",
    "resultSchema": {
      "server": "object",
      "database": "object",
      "cache": "object",
      "logging": "object"
    }
  }
}
```

### 16. Boolean Reasoning
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Is it possible for a statement to be both true and false at the same time in classical logic? Explain why or why not."
  }
}
```

---

## Using with Different Models

### Claude (anti-preamble)
```bash
MODEL=claude-3-5-sonnet node index.js
```

### GPT-4 (concise reasoning)
```bash
MODEL=gpt-4o node index.js
```

### Gemini (no markdown)
```bash
MODEL=gemini-1-5-pro node index.js
```

### With Fallback Models
```bash
MODEL=claude-3-5-sonnet FALLBACK_MODELS=gpt-4o,gemini-1-5-pro node index.js
```

---

## Expected Response Format

All examples return:

```
🤖 Agentic CoT Result:

**Reasoning:** <step-by-step thinking>

**Answer:** <final result>

📊 Token Usage: <input> in / <output> out / <budget> budget
```

If `resultSchema` is provided and the result doesn't match, the server retries with a correction hint.
