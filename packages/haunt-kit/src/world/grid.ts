import type { CellDef, ItemInit, Legend, ParsedGrid, Pos } from './types';

export class GridError extends Error {
  constructor(
    message: string,
    /** 1-based, or 0 when the error is about the whole grid or the legend. */
    readonly row: number,
    readonly col: number,
  ) {
    super(message);
    this.name = 'GridError';
  }
}

export const DEFAULT_LEGEND: Legend = {
  '#': { wall: true },
  '.': {},
};

const MARKER_RE = /^[a-z][a-z0-9_-]*$/;

function checkLegend(legend: Legend): void {
  for (const [ch, def] of Object.entries(legend)) {
    if ([...ch].length !== 1) throw new GridError(`legend key "${ch}" must be one character`, 0, 0);
    if (def.wall && (def.actor !== undefined || def.item !== undefined || def.marker !== undefined)) {
      throw new GridError(`legend entry "${ch}" is a wall, so it cannot also hold an actor, item or marker`, 0, 0);
    }
    if (def.marker !== undefined && !MARKER_RE.test(def.marker)) {
      throw new GridError(`legend entry "${ch}" has an invalid marker name "${def.marker}"`, 0, 0);
    }
  }
}

/** Parses rows of text into a map, actor starts, items, markers and free tiles. Throws `GridError`. */
export function parseGrid(rows: readonly string[], legend: Legend = {}): ParsedGrid {
  const merged: Legend = { ...DEFAULT_LEGEND, ...legend };
  checkLegend(merged);
  if (rows.length === 0 || rows[0]!.length === 0) throw new GridError('the grid has no rows', 0, 0);

  const h = rows.length;
  const w = rows[0]!.length;
  const walls = new Set<number>();
  const out: ParsedGrid = { map: { w, h, walls }, starts: [], items: [], markers: {}, free: [] };

  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    if (row.length !== w) {
      throw new GridError(`row ${y + 1} has ${row.length} characters, expected ${w}`, y + 1, Math.min(row.length, w) + 1);
    }
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      const def: CellDef | undefined = Object.hasOwn(merged, ch) ? merged[ch] : undefined;
      if (!def) throw new GridError(`character "${ch}" at row ${y + 1}, column ${x + 1} is not in the legend`, y + 1, x + 1);
      const pos: Pos = { x, y };
      if (def.wall) {
        walls.add(y * w + x);
        continue;
      }
      if (def.actor !== undefined) out.starts.push({ kind: def.actor, pos: { ...pos } });
      if (def.item !== undefined) {
        const item: ItemInit = { type: def.item.type, pos: { ...pos } };
        if (def.item.solid !== undefined) item.solid = def.item.solid;
        if (def.item.state !== undefined) item.state = { ...def.item.state };
        out.items.push(item);
      }
      if (def.marker !== undefined) (out.markers[def.marker] ??= []).push({ ...pos });
      if (def.actor === undefined && def.item === undefined && def.marker === undefined) out.free.push({ ...pos });
    }
  }
  return out;
}
