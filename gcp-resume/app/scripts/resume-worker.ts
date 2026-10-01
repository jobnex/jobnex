import { config } from "dotenv";
import { createServer } from "node:http";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const enabled = process.env.RESUME_GENERATION_ENABLED === "true";
  if (enabled && !process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for generation");
  const { tick } = await import("../lib/resume-worker");
  const { resumePool } = await import("../lib/resume-generation");
  await resumePool.query("SELECT id FROM resume_generation_requests LIMIT 0");
  let stopping = false;
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/health" ? 200 : 404, { "content-type": "application/json" });
    response.end(JSON.stringify(request.url === "/health" ? { status: "ok", enabled } : { error: "Not found" }));
  });
  if (process.env.PORT) server.listen(Number(process.env.PORT), "0.0.0.0");
  process.once("SIGTERM", () => { stopping = true; server.close(); });
  process.once("SIGINT", () => { stopping = true; server.close(); });
  console.log(enabled ? "Resume worker enabled" : "Resume worker disabled: awaiting provider configuration");
  while (!stopping) {
    if (enabled) {
      try { await tick(); }
      catch { console.error("Resume worker could not process the queue; check database and pipeline configuration"); }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await resumePool.end();
}
main().catch(() => { console.error("Resume worker configuration is incomplete"); process.exitCode = 1; });
