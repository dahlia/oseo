import { Buffer } from "node:buffer";
import { createPublicKey, verify } from "node:crypto";

// Published at https://ziglang.org/download/.
export const zigPublicKey =
  "RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U";

function decode(value: string, length: number): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== length || decoded.toString("base64") !== value) {
    throw new Error("Invalid Minisign base64 field.");
  }
  return decoded;
}

/** Verify Zig's prehashed Minisign format, including its signed filename. */
export function verifyZigSignature(
  digest: Buffer,
  minisign: string,
  filename: string,
  publicKey: string,
): void {
  const [untrusted, encodedSignature, trusted, encodedGlobal, ...extra] =
    minisign.trimEnd().split(/\r?\n/u);
  const prefix = "trusted comment: ";
  if (
    !untrusted?.startsWith("untrusted comment: ") ||
    encodedSignature == null ||
    !trusted?.startsWith(prefix) ||
    encodedGlobal == null ||
    extra.length !== 0
  ) {
    throw new Error("Invalid Minisign file.");
  }
  const key = decode(publicKey, 42);
  const packet = decode(encodedSignature, 74);
  if (
    key.toString("latin1", 0, 2) !== "Ed" ||
    packet.toString("latin1", 0, 2) !== "ED" ||
    !packet.subarray(2, 10).equals(key.subarray(2, 10))
  ) {
    throw new Error("Unexpected Minisign algorithm or key ID.");
  }
  // RFC 8410 SubjectPublicKeyInfo prefix for a raw Ed25519 public key.
  const spki = Buffer.from("302a300506032b6570032100", "hex");
  const ed25519 = createPublicKey({
    key: Buffer.concat([spki, key.subarray(10)]),
    format: "der",
    type: "spki",
  });
  const comment = trusted.slice(prefix.length);
  const archiveSignature = packet.subarray(10);
  if (
    !verify(null, digest, ed25519, archiveSignature) ||
    !verify(
      null,
      Buffer.concat([archiveSignature, Buffer.from(comment)]),
      ed25519,
      decode(encodedGlobal, 64),
    )
  ) {
    throw new Error("Invalid Minisign signature.");
  }
  const names = comment.split("\t").filter((part) => part.startsWith("file:"));
  if (names.length !== 1 || names[0] !== `file:${filename}`) {
    throw new Error(`Minisign trusted comment does not name '${filename}'.`);
  }
}
