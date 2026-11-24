// Haunt Kit prototype engine — pure, deterministic. Shared by the game and the solver.
(function (root) {
  const NEAR = { girl_near: 3, bell_near: 2, candle_near: 2, dark: 2, salt_adjacent: 1, ghost_near: 2 };
  const TICKS = 12;

  const COND_TEXT = {
    always: () => '',
    girl_near: () => 'the girl is near',
    bell_near: () => 'the bell is near',
    candle_near: () => 'a lit candle is near',
    dark: () => 'it is dark',
    salt_adjacent: () => 'salt is adjacent',
    ghost_near: () => 'a ghost is near',
    tick_is: (n) => `the clock strikes ${n}`,
    tick_after: (n) => `the clock has struck ${n}`,
  };
  const ACT_TEXT = {
    toward_girl: 'move toward the girl',
    away_girl: 'move away from the girl',
    stay: 'stay still',
    toward_candle: 'move toward the candle',
    away_candle: 'move away from the candle',
    snuff: 'snuff the candle',
    toward_window: 'walk toward the window',
    toward_bed: 'walk back to bed',
  };
  const ACTOR_NAME = { girl: 'girl', wisp: 'wisp', shade: 'shade', snuffer: 'snuffer' };

  function ruleText(rule, kind) {
    const who = 'THE ' + ACTOR_NAME[kind];
    const act = 'SHALL ' + ACT_TEXT[rule.act];
    if (rule.cond === 'always') return `${who} ${act}.`;
    const c = COND_TEXT[rule.cond](rule.n);
    if (rule.kw === 'IF') return `IF ${c}, THEN ${who} ${act}.`;
    return `WHEN ${c}, ${who} ${act}.`;
  }

  function parseMap(rows) {
    const h = rows.length, w = rows[0].length;
    const walls = [], free = [];
    const out = { w, h, walls: new Set(), bed: null, window: null, starts: [], fixed: [] };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '#') out.walls.add(y * w + x);
      else if (ch === 'B') out.bed = { x, y };
      else if (ch === 'W') out.window = { x, y };
      else if (ch === 'w' || ch === 's' || ch === 'n') out.starts.push({ x, y, kind: { w: 'wisp', s: 'shade', n: 'snuffer' }[ch] });
      else if (ch === 'c') out.fixed.push({ type: 'candle', x, y, lit: true, fixed: true });
      else if (ch === '.') free.push({ x, y });
    }
    out.free = free;
    return out;
  }

  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // level: { map, girl: [rules], ghosts: [[rules]...], events: [{tick, actor, at, rule}] }
  // placement: [{type,x,y}], inserts: [{card, actor, at}]
  function init(level, placement, inserts) {
    const m = level._map || (level._map = parseMap(level.map));
    const actors = [];
    actors.push({ id: 'girl', kind: 'girl', x: m.bed.x, y: m.bed.y, rules: level.girl.map((r) => ({ ...r, src: 'base' })) });
    m.starts.forEach((s, i) => {
      actors.push({ id: 'g' + i, kind: s.kind, x: s.x, y: s.y, rules: (level.ghosts[i] || []).map((r) => ({ ...r, src: 'base' })) });
    });
    // Apply player inserts in a stable order: higher `at` first per actor would shift; we insert in given order.
    for (const ins of inserts || []) {
      const a = actors.find((q) => q.id === ins.actor);
      if (!a) continue;
      a.rules.splice(Math.min(ins.at, a.rules.length), 0, { ...ins.card, src: 'card', cardId: ins.cardId });
    }
    const items = m.fixed.map((f) => ({ ...f })).concat((placement || []).map((p) => ({ ...p, lit: p.type === 'candle' })));
    return { tick: 0, actors, items, map: m, level, status: 'night', history: [] };
  }

  function blocked(s, x, y) {
    const m = s.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
    if (m.walls.has(y * m.w + x)) return true;
    for (const it of s.items) if (it.type === 'salt' && it.x === x && it.y === y) return true;
    return false;
  }

  function nearest(from, list) {
    let best = null, bd = 1e9;
    for (const t of list) { const d = dist(from, t); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  function step(s, a, target, away) {
    if (!target) return false;
    let dx = target.x - a.x, dy = target.y - a.y;
    if (away) { dx = -dx; dy = -dy; }
    if (dx === 0 && dy === 0) return false;
    const hx = Math.sign(dx), vy = Math.sign(dy);
    const order = Math.abs(dx) >= Math.abs(dy) ? [[hx, 0], [0, vy]] : [[0, vy], [hx, 0]];
    for (const [ox, oy] of order) {
      if (ox === 0 && oy === 0) continue;
      if (!blocked(s, a.x + ox, a.y + oy)) { a.x += ox; a.y += oy; return true; }
    }
    return false;
  }

  function holds(s, a, rule) {
    const girl = s.actors[0];
    const lit = s.items.filter((i) => i.type === 'candle' && i.lit);
    switch (rule.cond) {
      case 'always': return true;
      case 'girl_near': return dist(a, girl) <= NEAR.girl_near;
      case 'bell_near': return s.items.some((i) => i.type === 'bell' && dist(a, i) <= NEAR.bell_near);
      case 'candle_near': return lit.some((i) => dist(a, i) <= NEAR.candle_near);
      case 'dark': return !lit.some((i) => dist(a, i) <= NEAR.dark);
      case 'salt_adjacent': return s.items.some((i) => i.type === 'salt' && dist(a, i) <= NEAR.salt_adjacent);
      case 'ghost_near': return s.actors.some((g) => g.kind !== 'girl' && dist(a, g) <= NEAR.ghost_near);
      case 'tick_is': return s.tick === rule.n;
      case 'tick_after': return s.tick >= rule.n;
    }
    return false;
  }

  function act(s, a, rule) {
    const girl = s.actors[0];
    const lit = s.items.filter((i) => i.type === 'candle' && i.lit);
    switch (rule.act) {
      case 'toward_girl': return step(s, a, girl, false);
      case 'away_girl': return step(s, a, girl, true);
      case 'stay': return false;
      case 'toward_candle': return step(s, a, nearest(a, lit), false);
      case 'away_candle': return step(s, a, nearest(a, lit), true);
      case 'snuff': {
        const c = nearest(a, lit.filter((i) => dist(a, i) <= NEAR.candle_near));
        if (c) { c.lit = false; return true; }
        return false;
      }
      case 'toward_window': return step(s, a, s.map.window, false);
      case 'toward_bed': return step(s, a, s.map.bed, false);
    }
    return false;
  }

  // Advance one tick. Returns a trace for the UI.
  function tick(s) {
    if (s.status !== 'night') return null;
    s.tick += 1;
    const trace = { tick: s.tick, events: [], turns: [] };
    for (const ev of s.level.events || []) {
      if (ev.tick === s.tick) {
        const a = s.actors.find((q) => q.id === ev.actor);
        a.rules.splice(ev.at, 0, { ...ev.rule, src: 'rewrite' });
        trace.events.push({ actor: a.id, at: ev.at });
      }
    }
    const girl = s.actors[0];
    for (const a of s.actors) {
      const evals = [];
      let fired = -1;
      for (let i = 0; i < a.rules.length; i++) {
        const ok = holds(s, a, a.rules[i]);
        evals.push(ok);
        if (ok) { fired = i; break; }
      }
      // conditions below the fired rule are also evaluated (for "shadowed" detection), but never executed
      const shadowedTrue = [];
      for (let i = fired + 1; fired >= 0 && i < a.rules.length; i++) if (holds(s, a, a.rules[i])) shadowedTrue.push(i);
      const shadowRefs = shadowedTrue.map((i) => a.rules[i]);
      const from = { x: a.x, y: a.y };
      const rule = fired >= 0 ? a.rules[fired] : null;
      if (rule) act(s, a, rule);
      trace.turns.push({ actor: a.id, evals, fired, shadowedTrue, shadowRefs, firedBy: rule, from, to: { x: a.x, y: a.y }, rule });
      // capture check
      const caught = s.actors.find((g) => g.kind !== 'girl' && g.x === girl.x && g.y === girl.y);
      if (caught) {
        s.status = 'lost';
        trace.caught = { by: caught.id, actorTurn: a.id, rule, line: fired };
        break;
      }
    }
    if (s.status === 'night' && s.tick >= TICKS) s.status = 'won';
    s.history.push(trace);
    return trace;
  }

  function run(level, placement, inserts) {
    const s = init(level, placement, inserts);
    while (s.status === 'night') tick(s);
    return s;
  }

  // Which rules ever fired / were shadowed while true, over a finished run.
  function ruleStats(s) {
    // Keyed by rule object so lines inserted mid-night do not shift the counts.
    const byRule = new Map();
    for (const a of s.actors) for (const r of a.rules) byRule.set(r, { fired: 0, shadowedBy: null, everTrue: false });
    for (const tr of s.history) for (const t of tr.turns) {
      if (t.rule && byRule.has(t.rule)) { const st = byRule.get(t.rule); st.fired++; st.everTrue = true; }
      for (const r of t.shadowRefs || []) { const st = byRule.get(r); if (st) { st.everTrue = true; if (st.shadowedBy == null) st.shadowedBy = t.rule; } }
    }
    const stats = {};
    for (const a of s.actors) stats[a.id] = a.rules.map((r) => { const st = byRule.get(r); return { ...st, shadowedBy: st.shadowedBy ? a.rules.indexOf(st.shadowedBy) : null }; });
    return stats;
  }

  // ---------- Solver ----------
  function placementsFor(level) {
    const m = level._map || (level._map = parseMap(level.map));
    const tiles = m.free;
    const kinds = [];
    for (const [type, n] of Object.entries(level.items || {})) for (let i = 0; i < n; i++) kinds.push(type);
    const out = [];
    const used = new Set();
    function rec(k, minIdxByType, acc) {
      if (k === kinds.length) { out.push(acc.slice()); return; }
      const type = kinds[k];
      const start = (k > 0 && kinds[k - 1] === type) ? minIdxByType + 1 : 0;
      for (let i = start; i < tiles.length; i++) {
        if (used.has(i)) continue;
        used.add(i); acc.push({ type, x: tiles[i].x, y: tiles[i].y });
        rec(k + 1, i, acc);
        acc.pop(); used.delete(i);
      }
    }
    rec(0, -1, []);
    return out;
  }

  function insertOptions(level) {
    // Every card is placed in some actor's spec at some line, or left unused.
    const m = level._map || (level._map = parseMap(level.map));
    const actorIds = [{ id: 'girl', len: level.girl.length }].concat(m.starts.map((s, i) => ({ id: 'g' + i, len: (level.ghosts[i] || []).length })));
    const cards = level.cards || [];
    let combos = [[]];
    cards.forEach((card, ci) => {
      const next = [];
      for (const c of combos) {
        next.push(c.slice()); // unused
        for (const a of actorIds) {
          const extra = c.filter((q) => q.actor === a.id).length;
          for (let at = 0; at <= a.len + extra; at++) next.push(c.concat([{ card, cardId: ci, actor: a.id, at }]));
        }
      }
      combos = next;
    });
    return combos;
  }

  function solve(level) {
    const P = placementsFor(level), I = insertOptions(level);
    let wins = 0, total = 0, minItems = Infinity;
    for (const p of P) for (const ins of I) {
      total++;
      if (run(level, p, ins).status === 'won') { wins++; }
    }
    const empty = run(level, [], []).status;
    return { wins, total, emptyLoses: empty === 'lost' };
  }

  root.HK = { TICKS, NEAR, parseMap, ruleText, init, tick, run, ruleStats, solve, placementsFor, insertOptions, dist, ACT_TEXT, COND_TEXT };
})(typeof window !== 'undefined' ? window : globalThis);
