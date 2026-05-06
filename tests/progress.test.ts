import { createProgressSender, SendNotificationFn } from "../src/index.js";

describe("createProgressSender", () => {
  it("returns no-op when progressToken is undefined", async () => {
    const sent: unknown[] = [];
    const sender = createProgressSender(undefined, sent.push as unknown as SendNotificationFn, 10);

    // Should not throw and not send anything
    await sender(1, "step 1");
    await sender(2, "step 2");
    expect(sent).toEqual([]);
  });

  it("sends notification for first progress update", async () => {
    const sent: unknown[] = [];
    const sendFn = async (n: unknown) => { sent.push(n); };
    const sender = createProgressSender("token-123", sendFn as unknown as SendNotificationFn, 5);

    await sender(1, "starting");

    expect(sent).toHaveLength(1);
    const msg = sent[0] as Record<string, unknown>;
    expect(msg).toMatchObject({
      method: "notifications/progress",
      params: {
        progressToken: "token-123",
        progress: 1,
        total: 5,
        message: "starting",
      },
    });
  });

  it("debounces duplicate progress values", async () => {
    const sent: unknown[] = [];
    const sendFn = async (n: unknown) => { sent.push(n); };
    const sender = createProgressSender("token-123", sendFn as unknown as SendNotificationFn, 5);

    await sender(1, "step 1");
    await sender(1, "step 1 again"); // same progress
    await sender(2, "step 2");

    expect(sent).toHaveLength(2); // only 1 and 2, not the duplicate
  });

  it("sends with numeric progressToken", async () => {
    const sent: unknown[] = [];
    const sendFn = async (n: unknown) => { sent.push(n); };
    const sender = createProgressSender(42, sendFn as unknown as SendNotificationFn, 10);

    await sender(1, "first");

    const msg = sent[0] as Record<string, unknown>;
    const params = msg.params as Record<string, unknown>;
    expect(params.progressToken).toBe(42);
  });

  it("respects total steps passed to constructor", async () => {
    const sent: unknown[] = [];
    const sendFn = async (n: unknown) => { sent.push(n); };
    const sender = createProgressSender("t", sendFn as unknown as SendNotificationFn, 99);

    await sender(1, "test");

    const msg = sent[0] as Record<string, unknown>;
    const params = msg.params as Record<string, unknown>;
    expect(params.total).toBe(99);
  });
});
