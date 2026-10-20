export interface Note {
  /** serial, 1..1_000_000_000 */
  id: number;
  nation: string;
  /** face value */
  denom: number;
  palette: string;
  /** [background, ink, accent] hex colours */
  colors: string[];
  series: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'error';
  special: string;
  isError: boolean;
  /** e.g. "D-00000777" */
  serial: string;
  /** 8x8 symmetric emblem bitmap */
  grid: number[][];
}

export const SUPPLY: number;
export const DENOMS: number[];

/** Deterministically compute a note's descriptor from its serial. */
export function generate(id: number): Note;

/** Render a note as an SVG string; `opts.denom` overrides the face value (e.g. after break/fuse). */
export function svg(g: Note, opts?: { denom?: number }): string;
