/**
 * Simple in-memory metrics for CotForce-MCP.
 * Tracks request counts, outcomes, token usage, and parse latency.
 * Can be consumed by logging structured JSON or exposed via a future endpoint.
 */

export interface MetricsSnapshot {
  totalRequests: number;
  successfulParses: number;
  failedParses: number;
  truncatedResponses: number;
  samplingErrors: number;
  retriesTriggered: number;
  averageParseLatencyMs: number;
  averageTokenUsage: {
    input: number;
    output: number;
    budget: number;
  };
}

interface TokenUsageAccumulator {
  input: number;
  output: number;
  budget: number;
  count: number;
}

const metrics = {
  totalRequests: 0,
  successfulParses: 0,
  failedParses: 0,
  truncatedResponses: 0,
  samplingErrors: 0,
  retriesTriggered: 0,
  parseLatencies: [] as number[],
  tokenUsage: {
    input: 0,
    output: 0,
    budget: 0,
    count: 0,
  } as TokenUsageAccumulator,
};

export function recordRequest(): void {
  metrics.totalRequests++;
}

export function recordSuccess(): void {
  metrics.successfulParses++;
}

export function recordFailure(): void {
  metrics.failedParses++;
}

export function recordTruncation(): void {
  metrics.truncatedResponses++;
}

export function recordSamplingError(): void {
  metrics.samplingErrors++;
}

export function recordRetry(): void {
  metrics.retriesTriggered++;
}

export function recordParseLatency(ms: number): void {
  metrics.parseLatencies.push(ms);
  // Keep last 1000 to prevent unbounded growth
  if (metrics.parseLatencies.length > 1000) {
    metrics.parseLatencies.shift();
  }
}

export function recordTokenUsage(input: number, output: number, budget: number): void {
  metrics.tokenUsage.input += input;
  metrics.tokenUsage.output += output;
  metrics.tokenUsage.budget += budget;
  metrics.tokenUsage.count++;
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function getMetrics(): MetricsSnapshot {
  const tu = metrics.tokenUsage;
  return {
    totalRequests: metrics.totalRequests,
    successfulParses: metrics.successfulParses,
    failedParses: metrics.failedParses,
    truncatedResponses: metrics.truncatedResponses,
    samplingErrors: metrics.samplingErrors,
    retriesTriggered: metrics.retriesTriggered,
    averageParseLatencyMs: Math.round(average(metrics.parseLatencies)),
    averageTokenUsage: {
      input: tu.count ? Math.round(tu.input / tu.count) : 0,
      output: tu.count ? Math.round(tu.output / tu.count) : 0,
      budget: tu.count ? Math.round(tu.budget / tu.count) : 0,
    },
  };
}

export function resetMetrics(): void {
  metrics.totalRequests = 0;
  metrics.successfulParses = 0;
  metrics.failedParses = 0;
  metrics.truncatedResponses = 0;
  metrics.samplingErrors = 0;
  metrics.retriesTriggered = 0;
  metrics.parseLatencies.length = 0;
  metrics.tokenUsage.input = 0;
  metrics.tokenUsage.output = 0;
  metrics.tokenUsage.budget = 0;
  metrics.tokenUsage.count = 0;
}
