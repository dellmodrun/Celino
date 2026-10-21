import { spawn } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(buffer) {
  const digits = [0];
  for (const byte of buffer) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) { carry += digits[index] << 8; digits[index] = carry % 58; carry = Math.floor(carry / 58); }
    while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  for (const byte of buffer) { if (byte === 0) digits.push(0); else break; }
  return digits.reverse().map((digit) => alphabet[digit]).join("");
}

const port = 14320 + Math.floor(Math.random() * 1000), dataDir = mkdtempSync(join(tmpdir(), "celino-test-"));
const child = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", CELINO_DATA_DIR: dataDir }, stdio: ["ignore", "pipe", "inherit"] });
const origin = `http://127.0.0.1:${port}`;
const waitForServer = new Promise((resolveReady, reject) => { child.stdout.on("data", (chunk) => { if (chunk.toString().includes("Celino Core listening")) resolveReady(); }); child.on("exit", (code) => reject(new Error(`server exited ${code}`))); });
const call = async (path, options = {}) => { const response = await fetch(`${origin}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } }); const value = await response.json(); return { response, value }; };

try {
  await waitForServer;
  const health = await call("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.value.service, "celino-core");
  const edgeHealth = await call("/celino-api/api/health");
  assert.equal(edgeHealth.response.status, 200);
  assert.equal(edgeHealth.value.service, "celino-core");

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const address = encodeBase58(publicDer.subarray(-32));
  const challenge = await call("/api/auth/challenge", { method: "POST", body: JSON.stringify({ address }) });
  assert.equal(challenge.response.status, 201);
  const signature = sign(null, Buffer.from(challenge.value.message), privateKey).toString("base64");
  const verified = await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ challengeId: challenge.value.challengeId, signature }) });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.value.wallet, address);

  const manifest = { protocol: "celino/capability-manifest", version: "1.0.0", capability: "private-code-risk", accepts: ["text/code"], returns: ["verdict", "proof"], disclosure: { deny: ["source", "rules"] }, execution: { ttlSeconds: 120 }, privacy: { compositeLimit: .72 } };
  const published = await call("/api/capabilities", { method: "POST", headers: { authorization: `Bearer ${verified.value.token}` }, body: JSON.stringify(manifest) });
  assert.equal(published.response.status, 201);
  assert.match(published.value.capability.policyDigest, /^sha256:[a-f0-9]{64}$/);

  const listed = await call("/api/capabilities");
  assert.equal(listed.value.capabilities.length, 1);
  assert.notEqual(listed.value.capabilities[0].owner, address);

  const owned = await call("/api/owner/capabilities", { headers: { authorization: `Bearer ${verified.value.token}` } });
  assert.equal(owned.response.status, 200);
  assert.equal(owned.value.capabilities.length, 1);
  assert.equal(owned.value.capabilities[0].id, published.value.capability.id);

  const revoked = await call(`/api/capabilities/${published.value.capability.id}`, { method: "DELETE", headers: { authorization: `Bearer ${verified.value.token}` } });
  assert.equal(revoked.response.status, 200);
  assert.equal((await call("/api/capabilities")).value.capabilities.length, 0);
  const ownedAfterRevoke = await call("/api/owner/capabilities", { headers: { authorization: `Bearer ${verified.value.token}` } });
  assert.equal(ownedAfterRevoke.value.capabilities[0].status, "revoked");
  console.log("Celino Core integration test passed");
} finally {
  child.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
