import "dotenv/config";
import { runAgent } from "./tools/agent.js";

async function main() {
  const results = await runAgent("AI tools", {
    minSubs: 10000,
    maxSubs: 200000,
    maxVideos: 10,
  });

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error("Agent failed:", error.message);
  process.exitCode = 1;
});
