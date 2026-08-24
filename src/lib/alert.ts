// Failure alerting for the unattended duty sync.
//
// When the scraper breaks the app keeps serving the last known roster behind
// the stale flag, which is right for the user but means nobody finds out. The
// only visible symptom is a banner the maintainer never sees. This closes that
// gap.
//
// ALERT_WEBHOOK_URL takes any webhook that accepts a JSON POST. The payload
// carries `text` and `content` alongside the structured fields, which is what
// Slack and Discord respectively read, so both work without an adapter.

export interface AlertPayload {
  status: string;
  error?: string;
  rowsWritten: number;
  dutyDate: string | null;
}

/** Never throws and never blocks the caller's result: alerting is best-effort. */
export async function sendFailureAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const summary =
    `🔴 acikeczanevarmi.com — duty sync ${payload.status}` +
    `\nDuty date: ${payload.dutyDate ?? "—"}` +
    `\nRows written: ${payload.rowsWritten}` +
    (payload.error ? `\nError: ${payload.error}` : "") +
    `\nThe app is still serving the last known roster behind the stale flag.`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: summary, // Slack
        content: summary, // Discord
        ...payload,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn(`Alert webhook returned ${res.status}`);
  } catch (err) {
    // A broken alert channel must never turn a sync failure into a crash.
    console.warn("Alert webhook failed:", err instanceof Error ? err.message : err);
  }
}
