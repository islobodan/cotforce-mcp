import {
  getMetrics,
  recordFailure,
  recordParseLatency,
  recordRequest,
  recordRetry,
  recordSamplingError,
  recordSuccess,
  recordTokenUsage,
  recordTruncation,
  resetMetrics,
} from "../src/lib/metrics.js";

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("starts with all zeros", () => {
    const m = getMetrics();
    expect(m.totalRequests).toBe(0);
    expect(m.successfulParses).toBe(0);
    expect(m.failedParses).toBe(0);
    expect(m.truncatedResponses).toBe(0);
    expect(m.samplingErrors).toBe(0);
    expect(m.retriesTriggered).toBe(0);
    expect(m.averageParseLatencyMs).toBe(0);
    expect(m.averageTokenUsage).toEqual({ input: 0, output: 0, budget: 0 });
  });

  it("increments request counters", () => {
    recordRequest();
    recordRequest();
    expect(getMetrics().totalRequests).toBe(2);
  });

  it("tracks successes and failures", () => {
    recordSuccess();
    recordSuccess();
    recordFailure();
    const m = getMetrics();
    expect(m.successfulParses).toBe(2);
    expect(m.failedParses).toBe(1);
  });

  it("tracks truncations and sampling errors", () => {
    recordTruncation();
    recordTruncation();
    recordSamplingError();
    const m = getMetrics();
    expect(m.truncatedResponses).toBe(2);
    expect(m.samplingErrors).toBe(1);
  });

  it("tracks retries", () => {
    recordRetry();
    recordRetry();
    recordRetry();
    expect(getMetrics().retriesTriggered).toBe(3);
  });

  it("computes average parse latency", () => {
    recordParseLatency(100);
    recordParseLatency(200);
    recordParseLatency(300);
    expect(getMetrics().averageParseLatencyMs).toBe(200);
  });

  it("computes average token usage", () => {
    recordTokenUsage(10, 50, 100);
    recordTokenUsage(20, 100, 200);
    const m = getMetrics();
    expect(m.averageTokenUsage).toEqual({ input: 15, output: 75, budget: 150 });
  });

  it("resets all metrics", () => {
    recordRequest();
    recordSuccess();
    recordParseLatency(100);
    recordTokenUsage(10, 20, 30);
    resetMetrics();
    const m = getMetrics();
    expect(m.totalRequests).toBe(0);
    expect(m.successfulParses).toBe(0);
    expect(m.averageParseLatencyMs).toBe(0);
    expect(m.averageTokenUsage).toEqual({ input: 0, output: 0, budget: 0 });
  });

  it("caps latency history at 1000 entries", () => {
    for (let i = 0; i < 1100; i++) {
      recordParseLatency(100);
    }
    // Should not throw and average should still be 100
    expect(getMetrics().averageParseLatencyMs).toBe(100);
  });
});
