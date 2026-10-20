# @nacreumlabs/note-engine

Deterministic **Nacreum** note engine — `note = f(serial)`.

The same serial yields the same note on any machine, forever. Nothing is stored; anyone can
recompute (and therefore verify) a Nacreum banknote from its serial. This is the exact engine
that runs on [nacreum.xyz](https://nacreum.xyz).

## Install

Published to GitHub Packages. Add a scope registry to your `.npmrc`:

```
@nacreumlabs:registry=https://npm.pkg.github.com
```

then:

```sh
npm install @nacreumlabs/note-engine
```

## Usage

```js
const { generate, svg, SUPPLY, DENOMS } = require('@nacreumlabs/note-engine');

const note = generate(777);
// {
//   id: 777, nation: 'Toreholm', denom: 1, series: 'D',
//   rarity: 'common', special: 'low serial', serial: 'D-00000777', ...
// }

const markup = svg(note);           // -> an <svg> string
const changed = svg(note, { denom: 50 }); // override face value (e.g. after a break/fuse)
```

## API

- `generate(id: number): Note` — the full deterministic descriptor for a serial (`1..1e9`).
- `svg(note: Note, opts?): string` — render the note as an SVG string.
- `SUPPLY: number` — `1_000_000_000`.
- `DENOMS: number[]` — the denomination ladder.

Pure, side-effect-free, no dependencies. Verifiability is the point: run it yourself, compare
to the chain.

MIT © nacreumlabs
