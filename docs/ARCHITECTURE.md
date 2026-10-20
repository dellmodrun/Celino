# Nacreum — on-chain architecture

> Status: **design + WIP skeleton.** This document describes the intended on-chain program.
> The code under `programs/nacreum/` is an illustrative skeleton, **not audited, not
> production-ready, and not a security guarantee.** Numbers, rules, and account layouts will
> change before any launch.

## What the program has to guarantee

Nacreum is money that comes in **notes**: discrete, denominated units, each with a face value
and a serial. Two operations reshape them, and one invariant must always hold:

- **break** — split one note into several smaller notes (change),
- **fuse** — merge several notes into one larger note,
- **conservation** — *break and fuse never change the total face value in existence.* Only
  minting (bounded by a supply cap) may increase it. No churn, rounding, or reshape can print
  or burn value.

Everything else in the design serves that one invariant and its anti-abuse corollaries.

## Data model

### `Config` (one per issue, a PDA)
| field | type | meaning |
|---|---|---|
| `authority` | `Pubkey` | admin / mint gate (in production, the launch/curve authority) |
| `supply_cap` | `u64` | max total face value that may ever be minted (e.g. 1,000,000,000) |
| `minted` | `u64` | total face value minted so far; only `mint_note` increases it |
| `next_serial` | `u64` | monotonic serial counter, starts at 1 |

### `Note` (a PDA, seeds `["note", serial]`)
| field | type | meaning |
|---|---|---|
| `serial` | `u64` | unique, monotonically assigned; **never reused** |
| `denom` | `u64` | face value |
| `owner` | `Pubkey` | current holder |
| `hands` | `u32` | provenance: number of transfers this note has seen |

**Appearance is not stored.** A note's face — nation, palette, emblem, rarity, fancy-serial —
is a pure function of its serial: `appearance = f(serial)`. The browser engine (`index.html`)
and any on-chain-adjacent tooling run the *same* function, so anyone can recompute and verify a
note from its serial. Nothing to forge, nothing to host.

## Instructions

| instruction | effect | conservation |
|---|---|---|
| `initialize(supply_cap)` | create `Config` | — |
| `mint_note(denom)` | create a fresh note; `minted += denom`, require `minted <= supply_cap` | **increases** total (bounded) |
| `break_note(pieces: Vec<u64>)` | close input note, create one note per piece | require `sum(pieces) == input.denom` |
| `fuse_notes(inputs)` | close all inputs, create one note of the summed value | require `new.denom == sum(inputs.denom)` |
| `transfer_note(new_owner)` | change `owner`, `hands += 1` | unchanged |

The conservation checks are the heart of the program:

```
break:  require!(pieces.iter().sum::<u64>() == input.denom)
fuse:   require!(output.denom == inputs.iter().map(|n| n.denom).sum::<u64>())
```

Both use checked arithmetic; any overflow aborts the whole transaction.

## Anti-abuse

- **You cannot choose serials.** New notes from break/fuse get fresh serials from the monotonic
  `next_serial` counter. Since `appearance = f(serial)`, you can't churn break↔fuse to *farm* a
  rare serial or a million-note — you get whatever serials come next, and the reshape is
  value-neutral, so there is no economic gain to chase.
- **Serials are never reused.** A fused-away serial retires to the ledger (see below); it never
  comes back, so provenance and rarity claims stay honest.
- **Rate / size limits** (TBD in spec): caps on `pieces.len()` per break and inputs per fuse,
  to bound compute and discourage dust spam.

## Scale: a billion notes

One PDA account per note (as in the skeleton) is fine for tens of thousands but **does not scale
to 10⁹**. Production moves notes to **state compression** (a concurrent Merkle tree, à la
Bubblegum compressed NFTs): notes live as leaves, mutations post a proof + new root, and storage
cost collapses. The `serial → note` mapping and the conservation checks are the same; only the
storage substrate changes. The skeleton keeps the PDA model for readability.

## Off-chain (optional, only for richer UX)

- **Indexer** — reads the chain and answers "which notes does wallet X hold?" for the *billfold*
  view. A thin Node/Rust service over an RPC/Geyser stream. Not required to hold or move notes.
- **Retired ledger** — an index of fused-away serials with their last face value and `hands`,
  for the "vault" view.
- **Renderer** — the exact `f(serial)` used on the site; deterministic, so the indexer and the
  browser always agree.

None of these are trusted: everything they show is recomputable from public chain state.

## Relationship to the token / launch

The tradeable base is an ordinary SPL token, launched fair on **pump.fun**. "Notes" are the
layer above: `1 token = 1 unit of face value`, and a note is a bundle of that value wearing a
denomination + serial. The static site in this repo is the conceptual document; this program is
the primitive it argues for.

## Open questions (tracked for the pre-launch spec)

- exact denomination ladder and rarity weights (must be frozen & published before launch);
- compression scheme and proof-handling for break/fuse at scale;
- how the note layer binds to the pump.fun SPL mint (wrap vs. mirror);
- fee/rent handling for note creation and retirement.
