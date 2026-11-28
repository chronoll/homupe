import { spawn } from "node:child_process";

const command = process.argv[2];
if (!["build", "start"].includes(command)) {
  throw new Error("Usage: node scripts/run-fixtures.mjs build|start");
}
const env = { ...process.env, FACTORY_FIXTURES: "1", NEXT_TELEMETRY_DISABLED: "1" };
// Fixture runs never need application service credentials.
for (const key of Object.keys(env)) {
  if (key.startsWith("NOTION_") || ["REDIS_URL", "BLOB_READ_WRITE_TOKEN"].includes(key)) delete env[key];
}
const args = ["node_modules/next/dist/bin/next", command];
if (command === "start") args.push("--hostname", "127.0.0.1", "--port", env.FACTORY_PORT || "3100");
const child = spawn(process.execPath, args, { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
