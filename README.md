# Celino

**Private data. Public capability.**

Celino is a protocol concept for turning private knowledge into callable agent capabilities without exposing the source data. A caller sends a bounded intent to a sealed cell. The cell executes beside the owner's data, filters the result through owner policy, and returns a minimal answer with a proof capsule.

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
- responsive layouts without third-party scripts, cookies or trackers.

Run locally:

```bash
python -m http.server 4210
```

Then open `http://127.0.0.1:4210/`.

## Repository

```text
Celino/
├── index.html          # protocol interface
├── style.css           # VGA technical-punk visual system
├── app.js              # trace, privacy budget and proof capsule
├── celino-logo.png     # project mark
├── Web437_IBM_VGA_8x16.woff
└── docs/PROTOCOL.md    # architecture and trust boundaries
```

## Status

Celino currently publishes the protocol thesis, interface specification and browser-side reference instruments. Contract address and production network endpoints remain `TBA` until officially released.

## Links

- Website: <https://dellmodrun.github.io/Celino/>
- Source: <https://github.com/dellmodrun/Celino>

## License

MIT
