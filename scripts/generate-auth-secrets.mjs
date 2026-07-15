import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const HASH_LENGTH = 64;

async function readHidden(label) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/u);
  }

  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") {
        process.stdout.write("\n");
        process.stdin.setRawMode(false);
        process.stdin.pause();
        reject(new Error("Cancelled."));
        return;
      }
      if (character === "\r" || character === "\n") {
        process.stdout.write("\n");
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve(value);
        return;
      }
      if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += character;
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  let password;
  let confirmation;
  if (process.stdin.isTTY) {
    password = await readHidden("Access password: ");
    confirmation = await readHidden("Confirm password: ");
  } else {
    [password = "", confirmation = ""] = await readHidden("");
  }

  if (password.length < 12) throw new Error("Use an access password with at least 12 characters.");
  if (password !== confirmation) throw new Error("The two passwords do not match.");

  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, HASH_LENGTH, {
    N: COST,
    maxmem: 64 * 1024 * 1024,
    p: PARALLELIZATION,
    r: BLOCK_SIZE,
  });
  const passwordHash = [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    Buffer.from(hash).toString("base64url"),
  ].join("$");

  process.stdout.write("\nCopy these values into Render → Environment:\n\n");
  process.stdout.write("AI_AUTH_ENABLED=true\n");
  process.stdout.write(`AI_AUTH_PASSWORD_HASH=${passwordHash}\n`);
  process.stdout.write(`AI_AUTH_SESSION_SECRET=${randomBytes(48).toString("base64url")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
