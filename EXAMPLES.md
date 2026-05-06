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

---

## Hard Problems That Require CoT (Under-30B Models Often Fail)

### 3. Self-Descriptive Number (Autogram)
**Requires exhaustive search or constraint propagation. Easy to guess wrong.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Find a 4-digit number ABCD where: A = count of digit 0 in the number, B = count of digit 1, C = count of digit 2, D = count of digit 3. For example, if the number were 1210, you'd check: does it have 1 zero? 2 ones? 1 two? 0 threes? Test every possibility systematically from 0000 upward until you find the one that satisfies all four conditions.",
    "resultSchema": {
      "number": "string",
      "verification": "object"
    }
  }
}
```

### 4. Four Knights and Knaves (Interlocking Statements)
**Requires truth-table checking. Smaller models guess or contradict themselves.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "On an island, knights always tell the truth and knaves always lie. You meet A, B, C, D. A says: 'Exactly two of us are knights.' B says: 'C is a knave.' C says: 'A and B are the same type.' D says: 'At least one of A, B, C is a knight.' Determine who is a knight and who is a knave. Check every combination systematically and show which statements hold or fail.",
    "resultSchema": {
      "A": "string",
      "B": "string",
      "C": "string",
      "D": "string",
      "reasoning": "string"
    }
  }
}
```

### 5. Derangement Count for 5 Items
**Inclusion-exclusion with 5 terms. Easy to miscount without careful formula tracking.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Five people (A,B,C,D,E) each write their name on a card and put it in a hat. Each person draws one card at random. How many ways can they draw cards so that NO person gets their own name back? Use inclusion-exclusion: count all permutations, subtract those where at least one person gets their own card, add back where at least two do, etc. Show every term in the formula.",
    "resultSchema": {
      "answer": "number",
      "inclusion_exclusion_terms": "object"
    }
  }
}
```

### 6. Grid Path Counting with Obstacles
**Requires dynamic programming or careful subtraction. Smaller models try to enumerate and lose count.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "On a 5x5 grid, you start at the bottom-left corner (0,0) and want to reach the top-right corner (4,4). You can only move right or up. Three cells are blocked: (1,1), (2,3), and (3,1). Calculate how many valid paths exist. Use a step-by-step dynamic programming table: for each cell, count paths = paths from left + paths from below (if not blocked). Show the full 5x5 grid with path counts.",
    "resultSchema": {
      "total_paths": "number",
      "dp_table": "object"
    }
  }
}
```

### 7. Complex Simultaneous Equations (4 Variables)
**High working memory. Smaller models drop terms or make sign errors.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Solve this system step by step. W + X + Y + Z = 10. W + 2X + 3Y + 4Z = 20. W + 3X + 5Y + 7Z = 31. W + 4X + 7Y + 10Z = 42. Find W, X, Y, Z. Eliminate one variable at a time, showing each reduced system clearly.",
    "resultSchema": {
      "W": "number",
      "X": "number",
      "Y": "number",
      "Z": "number"
    }
  }
}
```

### 8. Nim Game Strategy (Binary XOR)
**Non-intuitive winning strategy. Smaller models suggest random moves.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "In the game of Nim, there are three piles with 3, 5, and 7 stones. Two players take turns removing any number of stones from a single pile. The player who takes the last stone wins. Using binary XOR (nim-sum), determine whether the first player has a winning strategy. If yes, show the exact first move they should make. Compute the binary representations and XOR them step by step.",
    "resultSchema": {
      "first_player_wins": "boolean",
      "nim_sum": "number",
      "recommended_move": "string"
    }
  }
}
```

### 9. Counting Triangles in a Complex Figure
**Systematic enumeration required. Easy to miss overlapping triangles.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "A large equilateral triangle is divided into 4 smaller equilateral triangles per side (like a Sierpinski sieve of depth 2). Count ALL triangles of every size in the figure. Don't guess — categorize by side length (1 unit, 2 units, 3 units, 4 units) and count each category separately, then sum.",
    "resultSchema": {
      "total_triangles": "number",
      "by_size": "object"
    }
  }
}
```

### 10. Multi-Conditional Probability
**Bayes' theorem with multiple conditions. Smaller models multiply wrong probabilities.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "A factory has three machines: A produces 40% of items with 2% defect rate, B produces 35% with 3% defect rate, C produces 25% with 4% defect rate. A random item is defective. What is the probability it came from machine B? Use Bayes' theorem. First compute P(defect), then P(defect|B), then apply the formula. Show all fractions before simplifying.",
    "resultSchema": {
      "probability": "string",
      "numerator": "string",
      "denominator": "string"
    }
  }
}
```

### 11. Tournament Ranking from Partial Results
**Constraint propagation across multiple matches. Easy to make contradictory assumptions.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Four players (P1, P2, P3, P4) played a round-robin tournament (everyone plays everyone once). Results: P1 beat P2. P2 beat P3. P3 beat P4. P4 beat P1. P1 beat P3. Each win = 2 points, draw = 1, loss = 0. Rank all players by points. If tied, use head-to-head. Show the full results table and how each player's total was calculated.",
    "resultSchema": {
      "rankings": "object",
      "points_table": "object"
    }
  }
}
```

### 12. Recursive Combinatorics (Catalan-like)
**Requires building recurrence relation from first principles.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "You have 6 pairs of parentheses. How many valid ways can you arrange them so every opening '(' has a matching closing ')' and they are properly nested? For n=1: () → 1 way. n=2: ()(), (()) → 2 ways. n=3: 5 ways. Build a recurrence: C(n) = sum of C(i)*C(n-1-i) for i=0 to n-1. Compute C(4), C(5), C(6) step by step using previously computed values.",
    "resultSchema": {
      "C4": "number",
      "C5": "number",
      "C6": "number",
      "recurrence_explanation": "string"
    }
  }
}
```

### 13. Clock Angle Problem with Continuous Motion
**Modular arithmetic plus relative speed. Smaller models use discrete hour positions.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "At 3:15, what is the exact angle between the hour and minute hands of an analog clock? Remember the hour hand moves continuously — it is not exactly on the 3. Calculate the position of each hand in degrees from 12 o'clock, then find the smaller angle between them.",
    "resultSchema": {
      "minute_hand_degrees": "number",
      "hour_hand_degrees": "number",
      "angle": "number"
    }
  }
}
```

### 14. Magic Square Construction
**Requires algebraic reasoning and constraint checking.**
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Construct a 3x3 magic square using the numbers 1 through 9 exactly once, where every row, column, and diagonal sums to the same value. First determine what the magic sum must be (total of 1-9 divided by 3). Then place the center number using the property that it appears in 4 lines. Build the square step by step, verifying each row/column/diagonal as you go.",
    "resultSchema": {
      "magic_sum": "number",
      "square": "object",
      "verifications": "object"
    }
  }
}
```

---

## Classic Problems (Moderate Difficulty)

### 15. Logic Puzzle — Mislabeled Boxes
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "Three boxes are labeled 'Apples', 'Oranges', and 'Mixed'. All labels are wrong. You can pick one fruit from one box. How do you correctly relabel all boxes?"
  }
}
```

### 16. Calendar/Date Calculation
```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "January 1, 2024 was a Monday. Using only reasoning, calculate what day of the week December 25, 2024 falls on. Account for 2024 being a leap year. Show your day-counting step by step."
  }
}
```

---

## With Result Schema Validation

### 17. Code Review Analysis
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

## Creative & Open-ended

### 18. Story Outline
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

### LMStudio via Direct HTTP
```bash
MODE=direct API_KEY=any API_BASE_URL=http://localhost:1234/v1 MODEL=local-model node index.js
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
