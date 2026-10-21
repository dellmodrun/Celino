# Celino

**Private data. Public capability.**

Celino turns private knowledge into callable agent capabilities without exposing the source data. A caller sends a bounded intent to a sealed cell. The cell executes beside the owner's data, filters the result through owner policy, and returns a minimal answer with a proof capsule.

## Core model

```text
intent envelope
      ↓
broker / minimize
      ↓
guardian / enforce policy
      ↓
vault cell / execute beside data
      ↓
minimal output + proof capsule
```

Celino does not treat private data as a downloadable product. The network makes the *capability* of that data addressable while custody remains with its owner.

## Roles

- **Vault Cell** — runs approved tasks beside a private source.
- **Broker Agent** — matches a bounded intent to a compatible capability and removes unnecessary context.
- **Guardian Agent** — blocks extraction, prompt injection, forbidden fields, and cumulative privacy leakage.
- **Proof Capsule** — commits to intent, policy, execution and output integrity without containing the protected source.

## Website

The site is deliberately buildless: plain HTML, CSS and JavaScript with a bundled IBM VGA bitmap font. It includes:

- an interactive sealed-execution trace;
- a deterministic privacy-budget calculator;
- local SHA-256 Proof Capsule generation using the Web Crypto API;
- an explicit adversarial threat model and cell lifecycle;
- capability-surface and revocation specifications;
- responsive layouts without third-party scripts, cookies or trackers.
- Wallet Standard discovery with explicit message-signing authentication;
- a live capability Manifest compiler and owner-published Registry.

Run locally:

```bash
python -m http.server 4210
```

Then open `http://127.0.0.1:4210/`.

## Core API

The production API is a separate, dependency-free Node service. It provides:

- `POST /api/auth/challenge` and `POST /api/auth/verify` for signed Solana wallet sessions;
- `GET /api/session` for session verification;
- `GET|POST /api/capabilities` for public discovery and authenticated publication;
- `GET /api/owner/capabilities` for the signed owner's complete management view;
- `DELETE /api/capabilities/:id` for owner-authorized revocation;
- `GET /api/health` and `GET /api/status` for real service state.

Wallet signatures are verified as Ed25519 signatures against the submitted Solana public key. Private keys never enter Celino. Registry records are persisted atomically, sessions expire after 24 hours, login challenges expire after five minutes, CORS is allowlisted, and request bodies and rates are bounded.

Run the API locally:

```bash
npm test
npm start
```

Production uses the included Docker Compose service, a persistent data mount and the shared Caddy edge.

Production API: `https://ohmium.167-99-74-236.sslip.io/celino-api`

## Repository

```text
Celino/
├── index.html          # protocol interface
├── celino.css          # VGA technical-punk visual system
├── celino.js           # trace, privacy budget and proof capsule
├── celino-logo.png     # project mark
├── Web437_IBM_VGA_8x16.woff
└── docs/PROTOCOL.md    # architecture and trust boundaries
```

## Status

The browser instruments, signed wallet authentication and off-chain capability Registry are implemented. Contract address, token settlement and on-chain Solana Registry remain `TBA` until officially released; the interface does not present them as active.

## Links

- Website: <https://dellmodrun.github.io/Celino/>
- Source: <https://github.com/dellmodrun/Celino>

## License

MIT
