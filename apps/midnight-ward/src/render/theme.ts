// Colours and fonts of the ward, from `.kiro/steering/game-feel.md` ("ink pact"). Blood red is for failure only.

export const INK = '#0d0b0a';
export const PARCHMENT = '#e8d9b5';
export const AMBER = '#f2a541';
export const TEAL = '#7fd1c7';
export const BLOOD = '#8c1c13';

/** The gold of a line that worked at dawn, and the mould of a shadowed one. Shared with the spec book. */
export const GOLD = '#e8b85a';

export const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
export const FONT_RULE = '"IM Fell English", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

/** Shades of the room: floor planks, plaster and wood. They are tints of the palette's ink and parchment. */
export const ROOM = {
  void: '#050403',
  floorA: '#2a2119',
  floorB: '#2f251c',
  plankLine: 'rgba(0, 0, 0, .35)',
  wallSide: [40, 31, 24],
  wallFront: [54, 42, 31],
  wallBack: [66, 50, 37],
  wallTop: [78, 62, 47],
  skirting: [26, 19, 14],
  wood: '#3b2a1c',
  sheet: '#cdbf9c',
  blanket: '#8a6f4d',
  skin: '#e4d6b4',
  hair: '#3a2a1e',
  gown: '#d9cfb5',
  brass: '#e8b85a',
  brassDark: '#9c7024',
  salt: '#e9e4d8',
  wax: '#efe3c4',
} as const;

export type Rgb = readonly [number, number, number];

/** A colour of the room scaled by a brightness. */
export function shade(rgb: Rgb, brightness: number): string {
  const b = Math.max(0, brightness);
  return `rgb(${Math.min(255, Math.round(rgb[0] * b))},${Math.min(255, Math.round(rgb[1] * b))},${Math.min(255, Math.round(rgb[2] * b))})`;
}
