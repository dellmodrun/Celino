import http from "node:http";
import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const port = Number(process.env.PORT || 4320);
const host = process.env.HOST || "0.0.0.0";
const dataDir = resolve(process.env.CELINO_DATA_DIR || "data");
const dataFile = resolve(dataDir, "state.json");
const publicUri = process.env.CELINO_PUBLIC_URI || "https://dellmodrun.github.io/Celino/";
const signInDomain = process.env.CELINO_SIGNIN_DOMAIN || new URL(publicUri).hostname;
const allowedOrigins = new Set((process.env.CELINO_ALLOWED_ORIGINS || "https://dellmodrun.github.io,http://127.0.0.1:4210,http://localhost:4210").split(",").map((item) => item.trim()).filter(Boolean));
const challenges = new Map();
const rate = new Map();
const startedAt = Date.now();
let requests = 0;

const emptyState = () => ({ version: 1, createdAt: new Date().toISOString(), capabilities: [], sessions: [] });
mkdirSync(dataDir, { recursive: true });
let state = existsSync(dataFile) ? { ...emptyState(), ...JSON.parse(readFileSync(dataFile, "utf8")) } : emptyState();

const now = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const id = (prefix) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const cleanText = (value, max = 160) => String(value || "").trim().slice(0, max);
function constantEqual(left, right) { const a = Buffer.from(left || ""), b = Buffer.from(right || ""); return a.length === b.length && timingSafeEqual(a, b); }
function persist() { const temp = `${dataFile}.tmp`; writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 }); renameSync(temp, dataFile); }
function json(response, status, value) { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(value)); }
async function body(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 128000) throw new Error("request body exceeds 128KB"); chunks.push(chunk); } return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
function withinLimit(request) { const key = request.socket.remoteAddress || "unknown", minute = Math.floor(Date.now() / 60000), current = rate.get(key); if (!current || current.minute !== minute) { rate.set(key, { minute, count: 1 }); return true; } current.count += 1; return current.count <= 180; }

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) throw new Error("invalid Solana address");
  const bytes = [0];
  for (const character of value) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("invalid Solana address");
    let carry = index;
    for (let cursor = 0; cursor < bytes.length; cursor += 1) { carry += bytes[cursor] * 58; bytes[cursor] = carry & 255; carry >>= 8; }
    while (carry) { bytes.push(carry & 255); carry >>= 8; }
  }
  for (let cursor = 0; value[cursor] === "1" && cursor < value.length - 1; cursor += 1) bytes.push(0);
  const result = Buffer.from(bytes.reverse());
  if (result.length !== 32) throw new Error("invalid Solana address");
  return result;
}

function verifyWalletSignature(address, message, signature) {
  const rawPublicKey = decodeBase58(address);
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawPublicKey]);
  const key = createPublicKey({ key: spki, format: "der", type: "spki" });
  const decoded = Buffer.from(signature || "", "base64");
  return decoded.length === 64 && verifySignature(null, Buffer.from(message), key, decoded);
}

function publicCapability(item) {
  const { owner, ...capability } = item;
  return { ...capability, owner: `${owner.slice(0, 4)}...${owner.slice(-4)}` };
}

function session(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const digest = sha256(token), timestamp = Date.now();
  state.sessions = state.sessions.filter((item) => Date.parse(item.expiresAt) > timestamp);
  return state.sessions.find((item) => constantEqual(item.tokenHash, digest)) || null;
}

function list(value, maxItems = 16) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => cleanText(item, 80)).filter(Boolean);
}

function validateManifest(input) {
  if (!input || input.protocol !== "celino/capability-manifest") throw new Error("unsupported manifest protocol");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(input.capability || "")) throw new Error("invalid capability name");
  if (!/^\d+\.\d+\.\d+$/.test(input.version || "")) throw new Error("version must use semantic versioning");
  const accepts = list(input.accepts), returns = list(input.returns), deny = list(input.disclosure?.deny);
  if (!accepts.length || !returns.length || !deny.length) throw new Error("accepts, returns and disclosure.deny are required");
  const ttlSeconds = Math.max(1, Math.min(86400, Number(input.execution?.ttlSeconds) || 120));
  const compositeLimit = Math.max(.01, Math.min(1, Number(input.privacy?.compositeLimit) || .72));
  return {
    protocol: "celino/capability-manifest",
    version: input.version,
    capability: input.capability,
    accepts,
    returns,
    disclosure: { deny },
    execution: { source: "owner-sealed", networkAccess: false, persistentMemory: false, ttlSeconds },
    privacy: { window: "24h", compositeLimit },
    settlement: { condition: "valid_output && valid_proof", status: "pending-contract" }
  };
}

setInterval(() => {
  const timestamp = Date.now();
  for (const [challengeId, challenge] of challenges) if (challenge.expiresAt <= timestamp) challenges.delete(challengeId);
  state.sessions = state.sessions.filter((item) => Date.parse(item.expiresAt) > timestamp);
}, 60000).unref();

const server = http.createServer(async (request, response) => {
  requests += 1;
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-headers", "authorization, content-type");
  response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
  if (origin && !allowedOrigins.has(origin)) return json(response, 403, { error: "origin not allowed" });
  if (!withinLimit(request)) return json(response, 429, { error: "rate limit exceeded" });

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true, service: "celino-core", version: state.version, time: now(), uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
    if (request.method === "GET" && url.pathname === "/api/status") return json(response, 200, { at: now(), requests, capabilities: state.capabilities.filter((item) => item.status === "published").length, sessions: state.sessions.length, contract: null, solanaRegistry: "pending-ca" });
    if (request.method === "GET" && url.pathname === "/api/capabilities") return json(response, 200, { at: now(), capabilities: state.capabilities.filter((item) => item.status === "published").map(publicCapability) });

    if (request.method === "POST" && url.pathname === "/api/auth/challenge") {
      const input = await body(request), address = cleanText(input.address, 44);
      decodeBase58(address);
      const challengeId = id("challenge"), nonce = randomBytes(16).toString("base64url"), issuedAt = now(), expirationTime = new Date(Date.now() + 5 * 60000).toISOString();
      const message = `${signInDomain} wants you to sign in with your Solana account:\n${address}\n\nAuthenticate to Celino. This request does not trigger a blockchain transaction.\n\nURI: ${publicUri}\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}`;
      challenges.set(challengeId, { address, message, expiresAt: Date.parse(expirationTime), remoteAddress: request.socket.remoteAddress });
      return json(response, 201, { challengeId, message, expirationTime });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/verify") {
      const input = await body(request), challenge = challenges.get(cleanText(input.challengeId, 64));
      if (!challenge || challenge.expiresAt <= Date.now()) return json(response, 401, { error: "challenge expired or unavailable" });
      if (challenge.remoteAddress !== request.socket.remoteAddress) return json(response, 401, { error: "challenge origin changed" });
      if (!verifyWalletSignature(challenge.address, challenge.message, input.signature)) return json(response, 401, { error: "wallet signature is invalid" });
      challenges.delete(input.challengeId);
      const token = `cel_sess_${randomBytes(32).toString("base64url")}`, expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      state.sessions = state.sessions.filter((item) => item.wallet !== challenge.address);
      state.sessions.push({ id: id("session"), wallet: challenge.address, tokenHash: sha256(token), createdAt: now(), expiresAt });
      persist();
      return json(response, 200, { token, wallet: challenge.address, expiresAt });
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const active = session(request);
      return active ? json(response, 200, { authenticated: true, wallet: active.wallet, expiresAt: active.expiresAt }) : json(response, 401, { authenticated: false });
    }

    if (request.method === "POST" && url.pathname === "/api/capabilities") {
      const active = session(request); if (!active) return json(response, 401, { error: "signed wallet session required" });
      const manifest = validateManifest(await body(request)), canonical = JSON.stringify(manifest), policyDigest = sha256(canonical);
      const existing = state.capabilities.find((item) => item.owner === active.wallet && item.capability === manifest.capability && item.status === "published");
      if (existing) return json(response, 409, { error: "this wallet already published that capability name" });
      const capability = { id: id("cap"), ...manifest, policyDigest: `sha256:${policyDigest}`, owner: active.wallet, status: "published", registry: "off-chain", createdAt: now(), updatedAt: now() };
      state.capabilities.unshift(capability); persist();
      return json(response, 201, { capability: publicCapability(capability) });
    }

    const remove = url.pathname.match(/^\/api\/capabilities\/([^/]+)$/);
    if (request.method === "DELETE" && remove) {
      const active = session(request); if (!active) return json(response, 401, { error: "signed wallet session required" });
      const capability = state.capabilities.find((item) => item.id === remove[1]);
      if (!capability) return json(response, 404, { error: "capability not found" });
      if (capability.owner !== active.wallet) return json(response, 403, { error: "only the owner wallet can revoke this capability" });
      capability.status = "revoked"; capability.updatedAt = now(); persist();
      return json(response, 200, { revoked: true, id: capability.id });
    }

    return json(response, 404, { error: "route not found" });
  } catch (error) {
    const clientError = /invalid|required|unsupported|must use|exceeds/.test(error.message || "");
    return json(response, clientError ? 422 : error instanceof SyntaxError ? 400 : 500, { error: error.message || "internal server error" });
  }
});

server.listen(port, host, () => console.log(`Celino Core listening on http://${host}:${port}`));
