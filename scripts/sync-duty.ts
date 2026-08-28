// Runs the duty sync from the command line: `npm run sync-duty`
import "./load-env";
import { supabaseAdmin } from "../src/lib/supabase";
import { runDutySync } from "../src/lib/scrape/sync-duty";

async function main() {
  const result = await runDutySync(supabaseAdmin());
  const horizon = result.horizonEnd ? ` … ${result.horizonEnd}` : "";
  console.log(
    `sync-duty: ${result.status}, ${result.rowsWritten} rows across ${result.daysCovered} day(s) ` +
      `(${result.dutyDate ?? "—"}${horizon})`
  );
  if (result.status !== "ok") {
    console.error(result.error);
    process.exitCode = 1;
  }
}

main();
