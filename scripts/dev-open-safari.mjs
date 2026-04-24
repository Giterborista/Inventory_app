import { spawn } from "node:child_process";

const host = "localhost";
const port = 3000;
const appUrl = `http://${host}:${port}`;

const nextCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nextArgs = ["next", "dev"];

const nextProcess = spawn(nextCommand, nextArgs, {
  stdio: "inherit",
  env: process.env,
});

let openTriggered = false;
let openTimer = null;

function openInSafari() {
  if (openTriggered) {
    return;
  }
  openTriggered = true;
  spawn("open", ["-a", "Safari", appUrl], {
    stdio: "ignore",
    detached: true,
  }).unref();
}

async function waitForServerAndOpen() {
  const startedAt = Date.now();
  const timeoutMs = 30000;

  while (!openTriggered && Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(appUrl, { method: "GET" });
      if (response.ok || response.status >= 300) {
        openInSafari();
        return;
      }
    } catch {}

    await new Promise((resolve) => {
      openTimer = setTimeout(resolve, 500);
    });
  }
}

void waitForServerAndOpen();

function shutdown(code = 0) {
  if (openTimer) {
    clearTimeout(openTimer);
  }
  if (!nextProcess.killed) {
    nextProcess.kill("SIGINT");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

nextProcess.on("exit", (code, signal) => {
  if (openTimer) {
    clearTimeout(openTimer);
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
