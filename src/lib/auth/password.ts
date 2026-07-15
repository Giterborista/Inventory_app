import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const HASH_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function derivePasswordHash(password: string, salt: Buffer, length: number, options: { N: number; maxmem: number; p: number; r: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText, extraPart] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText || extraPart) return false;

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  if (
    cost !== SCRYPT_COST ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return false;
  }

  try {
    const expectedHash = Buffer.from(hashText, "base64url");
    if (expectedHash.length !== HASH_LENGTH) return false;
    const actualHash = await derivePasswordHash(password, Buffer.from(saltText, "base64url"), HASH_LENGTH, {
      N: cost,
      maxmem: 64 * 1024 * 1024,
      p: parallelization,
      r: blockSize,
    });
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
