import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedAgentCredential {
  version: 1;
  iv: string;
  tag: string;
  data: string;
}
function credentialKey() {
  const value = process.env.AGENT_CREDENTIAL_ENCRYPTION_KEY;
  const key = Buffer.from(value ?? "", "base64");
  if (!value || key.length !== 32 || key.toString("base64") !== value)
    throw new Error("AGENT_CREDENTIAL_KEY_NOT_CONFIGURED");
  return key;
}
export function encryptAgentCredential(
  secret: string,
  userId: string,
  runId: string,
): EncryptedAgentCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  cipher.setAAD(Buffer.from(`taibu-agent:v1:${userId}:${runId}`));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function decryptAgentCredential(
  value: EncryptedAgentCredential,
  userId: string,
  runId: string,
) {
  if (value.version !== 1)
    throw new Error("AGENT_CREDENTIAL_VERSION_UNSUPPORTED");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    credentialKey(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`taibu-agent:v1:${userId}:${runId}`));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
