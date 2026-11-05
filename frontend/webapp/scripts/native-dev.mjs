#!/usr/bin/env node
/**
 * Live reload on a device / simulator: Vite on the LAN + `cap run --live-reload`.
 *
 *   npm run native:dev:ios                           (iPhone 17 simulator)
 *   npm run native:dev:ios [-- --sim "iPhone 17 Pro"] (another simulator by name)
 *   npm run native:dev:ios [-- --target <device-id>]
 *   npm run native:dev:android [-- --target <device-id>]
 *
 * The phone must be on the same Wi-Fi as this machine. Override the address
 * with CAP_DEV_HOST=192.168.x.y when the auto-picked interface is wrong.
 */
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";

const platform = process.argv[2];
if (platform !== "ios" && platform !== "android") {
  console.error("Usage: node scripts/native-dev.mjs <ios|android> [cap run args]");
  process.exit(1);
}
const extra = process.argv.slice(3);

/** Booted simulator with this name first, else the newest available runtime. */
function simulatorId(name) {
  const { devices } = JSON.parse(
    execFileSync("xcrun", ["simctl", "list", "devices", "available", "-j"], { encoding: "utf8" }),
  );
  const matches = Object.entries(devices)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([, list]) => list.filter((d) => d.name === name));
  const pick = matches.find((d) => d.state === "Booted") ?? matches[0];
  if (!pick) {
    console.error(`No available simulator named "${name}".`);
    process.exit(1);
  }
  return pick.udid;
}

const DEFAULT_IOS_SIM = "iPhone 17";
const simFlag = extra.indexOf("--sim");
if (simFlag !== -1) {
  const [, name] = extra.splice(simFlag, 2);
  extra.push("--target", simulatorId(name));
} else if (platform === "ios" && !extra.includes("--target")) {
  extra.push("--target", simulatorId(DEFAULT_IOS_SIM));
}
const port = process.env.CAP_DEV_PORT || "5173";

function lanAddress() {
  if (process.env.CAP_DEV_HOST) return process.env.CAP_DEV_HOST;
  const nets = os.networkInterfaces();
  const preferred = ["en0", "en1", "wlan0", "eth0"];
  const names = [
    ...preferred.filter((n) => nets[n]),
    ...Object.keys(nets).filter((n) => !preferred.includes(n)),
  ];
  for (const name of names) {
    for (const addr of nets[name] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

const host = lanAddress();
if (!host) {
  console.error("No LAN IPv4 address found. Set CAP_DEV_HOST=<your Mac's IP>.");
  process.exit(1);
}
console.log(`\nLive reload: http://${host}:${port}  (${platform})\n`);

const children = [];
function run(cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
  children.push(child);
  child.on("exit", (code) => {
    for (const c of children) if (c !== child && !c.killed) c.kill("SIGINT");
    process.exit(code ?? 0);
  });
  return child;
}

// vite.config.ts proxies API calls through the dev server when this is set.
process.env.CAP_LIVE_RELOAD_ORIGIN = `http://${host}:${port}`;

run("npx", ["vite", "--mode", "native", "--host", "0.0.0.0", "--port", port]);
run("npx", [
  "cap",
  "run",
  platform,
  "--live-reload",
  "--host",
  host,
  "--port",
  port,
  ...extra,
]);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const c of children) if (!c.killed) c.kill(sig);
  });
}
