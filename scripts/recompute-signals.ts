// Recomputes every market signal from the last two windows.
//
// Run on a schedule (Render cron, `npm run signals:recompute`). Deliberately
// a separate job rather than something computed on page load: it's a scan
// over every recent post in the country, the result is identical for every
// viewer, and a farmer opening the app shouldn't pay for it.
import { recomputeMarketSignals } from "../src/lib/signals-compute";

async function main() {
  const count = await recomputeMarketSignals();
  console.log(`Recomputed market signals: ${count} signal(s) currently hold.`);
}

main()
  .catch((err) => {
    console.error("Failed to recompute market signals:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
