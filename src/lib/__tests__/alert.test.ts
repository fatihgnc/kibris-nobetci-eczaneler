import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFailureAlert } from "../alert";

const payload = { status: "failed", error: "Sanity check failed: only 2 records parsed", rowsWritten: 0, dutyDate: null };

describe("sendFailureAlert", () => {
  afterEach(() => {
    delete process.env.ALERT_WEBHOOK_URL;
    vi.restoreAllMocks();
  });

  it("stays silent when no webhook is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await sendFailureAlert(payload);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts a payload Slack and Discord can both read", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://example.test/hook";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    await sendFailureAlert(payload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/hook");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain("duty sync failed");   // Slack
    expect(body.content).toContain("duty sync failed"); // Discord
    expect(body.text).toContain("only 2 records parsed");
    expect(body.status).toBe("failed");
    expect(body.rowsWritten).toBe(0);
  });

  it("swallows a broken webhook rather than turning a sync failure into a crash", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://example.test/hook";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(sendFailureAlert(payload)).resolves.toBeUndefined();
  });
});
