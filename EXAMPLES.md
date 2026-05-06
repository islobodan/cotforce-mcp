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

## Complex Reasoning (CoT Stress Tests)

### 7. Logic Puzzle — Mislabeled Boxes
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Three boxes are labeled 'Apples', 'Oranges', and 'Mixed'. All labels are wrong. You can pick one fruit from one box. How do you correctly relabel all boxes?"
  }
}
```

### 8. Multi-step Deduction
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "A farmer has 17 sheep and all but 9 die. How many sheep are left?"
  }
}
```

### 9. Probability with Constraints
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "What is the probability of rolling a sum of 7 with two fair six-sided dice?"
  }
}
```

---

## Problems That Require CoT (Under-30B Models Fail Without It)

### 10. Frobenius Coin Problem
**Smaller models without CoT often guess wrong or fail to prove.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Using only 3-cent and 5-cent stamps, what is the largest postage amount you CANNOT make? Prove your answer by checking every amount from 1 upward, showing which are possible and why the largest impossible one cannot be formed.",
    "resultSchema": {
      "largest_impossible": "number",
      "explanation": "string"
    }
  }
}
```

### 11. Water Jug Problem (State Tracking)
**Requires tracking jug states step-by-step. Smaller models hallucinate invalid moves.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "You have a 3-liter jug and a 5-liter jug. The faucet is broken — you can only fill a jug completely, empty it completely, or pour from one to the other until one is empty or the other is full. Describe the exact sequence of steps to measure exactly 4 liters. Track the state (amount in each jug) after every single move.",
    "resultSchema": {
      "steps": "object",
      "step_count": "number"
    }
  }
}
```

### 12. Age Word Problem with System of Equations
**Smaller models often skip setup and jump to a wrong number.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "In 5 years, Alice will be twice as old as Bob was 3 years ago. Right now, Alice is 4 years older than Bob. How old is Alice now? Show every equation you set up and solve step by step.",
    "resultSchema": {
      "alice_age": "number",
      "bob_age": "number",
      "equations": "object"
    }
  }
}
```

### 13. Calendar/Date Calculation
**Requires modular arithmetic. Easy to make off-by-one errors without CoT.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "January 1, 2024 was a Monday. Using only reasoning (no pattern matching from training data), calculate what day of the week December 25, 2024 falls on. Account for 2024 being a leap year. Show your day-counting step by step."
  }
}
```

### 14. Combinatorics with Overlapping Sets
**Inclusion-exclusion principle. Smaller models often double-count.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "In a class of 40 students: 25 play soccer, 20 play basketball, and 10 play neither. How many play both soccer and basketball? Use a Venn diagram approach and show the inclusion-exclusion formula step by step.",
    "resultSchema": {
      "both": "number",
      "only_soccer": "number",
      "only_basketball": "number",
      "neither": "number"
    }
  }
}
```

### 15. Constraint Satisfaction (Logic Grid)
**Requires propagating constraints. Smaller models guess or lose track.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Four people live in a row of houses numbered 1 to 4. Clues: (1) Alice does not live in house 1 or 4. (2) Bob lives next to Charlie. (3) Diana lives in house 4. (4) Bob does not live in house 2. Who lives in each house? Show your elimination process for each clue.",
    "resultSchema": {
      "house_1": "string",
      "house_2": "string",
      "house_3": "string",
      "house_4": "string"
    }
  }
}
```

### 16. Recursive Sequence
**Requires building the sequence step by step. Jumping to closed form often fails for smaller models.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "A sequence starts: a(1) = 2, a(2) = 3. For n > 2, a(n) = a(n-1) * a(n-2) - a(n-1) - a(n-2). Compute a(3), a(4), a(5), a(6), and a(7). Show every substitution explicitly so I can verify each step.",
    "resultSchema": {
      "a3": "number",
      "a4": "number",
      "a5": "number",
      "a6": "number",
      "a7": "number"
    }
  }
}
```

---

## Creative & Open-ended

### 17. Story Outline
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

### 18. Recipe Adaptation
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

### 19. Regex Construction
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Write a regex that matches valid IPv4 addresses (e.g., 192.168.1.1)"
  }
}
```

### 20. SQL Query
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Write a SQL query to find the top 5 employees by salary in each department"
  }
}
```

### 21. Algorithm Design
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

### 22. Nested JSON Result
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

### 23. Boolean Reasoning
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

### LMStudio via Direct HTTP
```bash
MODE=direct API_KEY=any API_BASE_URL=http://localhost:1234/v1 MODEL=local-model node index.js
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
