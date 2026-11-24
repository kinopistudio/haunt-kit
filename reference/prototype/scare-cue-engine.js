// Scare Cue prototype engine: same rule semantics as Midnight Ward (top-down, first true rule fires),
// but the visitor is nondeterministic and the checker searches every visitor path for a safety violation.
(function (root) {
  const TICKS = 12, NEAR = 2, ADJ = 1;
  const MAP = [
    '#########',
    '#V..J...#',
    '#.......#',
    '#.#####.#',
    '#.......#',
    '####F#E##',
    '#########',
  ];
  const R = (kw, cond, act) => ({ kw, cond, act });
  const PROPS = [
    { id: 'jump', kind: 'jump', name: 'Jump-scare', path: '.kiro/specs/prop-jump-scare', rules: [R('WHEN', 'visitor_near', 'trigger')] },
    { id: 'fog', kind: 'fog', name: 'Fog machine', path: '.kiro/specs/prop-fog', rules: [R('WHEN', 'visitor_near', 'spray'), R('', 'always', 'stop')] },
    { id: 'light', kind: 'light', name: 'Exit light', path: '.kiro/specs/prop-exit-light', rules: [R('WHEN', 'fog_on', 'light_off'), R('', 'always', 'light_on')] },
  ];
  const CARDS = [
    { actor: 'light', rule: R('IF', 'fog_on', 'light_on'), tag: 'Fix for the exit light' },
    { actor: 'jump', rule: R('IF', 'visitor_adjacent', 'stay'), tag: 'Fix for the jump-scare' },
    { actor: 'fog', rule: R('IF', 'light_off', 'stop'), tag: 'Fix for the fog machine' },
  ];
  const SAFETY = [
    { id: 'S1', text: 'THE fog SHALL NOT be on while the exit light is off.', short: 'No fog in the dark' },
    { id: 'S2', text: 'THE jump-scare SHALL NOT trigger while a visitor is adjacent.', short: 'No scare within reach' },
  ];
  const WHO = { jump: 'THE jump-scare', fog: 'THE fog machine', light: 'THE exit light' };
  const COND = { always: '', visitor_near: 'a visitor is near', visitor_adjacent: 'a visitor is adjacent', fog_on: 'the fog is on', light_off: 'the exit light is off' };
  const ACT = { trigger: 'trigger', stay: 'stay still', spray: 'spray fog', stop: 'stop the fog', light_off: 'turn off', light_on: 'stay on' };
  function ruleText(r, kind) {
    const w = WHO[kind], a = 'SHALL ' + ACT[r.act];
    if (r.cond === 'always') return `${w} ${a}.`;
    if (r.kw === 'IF') return `IF ${COND[r.cond]}, THEN ${w} ${a}.`;
    return `WHEN ${COND[r.cond]}, ${w} ${a}.`;
  }

  function parse() {
    const h = MAP.length, w = MAP[0].length, walk = new Set(), pos = {};
    let start = null, exit = null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = MAP[y][x];
      if (c === '.' || c === 'V' || c === 'E') walk.add(y * w + x);
      if (c === 'V') start = { x, y };
      if (c === 'E') exit = { x, y };
      if (c === 'J') pos.jump = { x, y };
      if (c === 'F') pos.fog = { x, y };
    }
    pos.light = exit;
    return { w, h, walk, start, exit, pos };
  }
  const M = parse();
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  function moves(v) {
    const out = [{ x: v.x, y: v.y }];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = v.x + dx, y = v.y + dy;
      if (M.walk.has(y * M.w + x)) out.push({ x, y });
    }
    return out;
  }
  // specs: { jump: [rules], fog: [rules], light: [rules] } (cards already inserted)
  function holds(st, id, r) {
    const d = dist(st.v, M.pos[id]);
    switch (r.cond) {
      case 'always': return true;
      case 'visitor_near': return d <= NEAR;
      case 'visitor_adjacent': return d <= ADJ;
      case 'fog_on': return st.fog;
      case 'light_off': return !st.light;
    }
    return false;
  }
  // Advance one tick after the visitor has moved to `to`. Returns { st, turns, violation, scared }.
  function step(st0, to, specs) {
    const st = { v: to, fog: st0.fog, light: st0.light, tick: st0.tick + 1 };
    const turns = []; let violation = null, scared = false;
    for (const p of PROPS) {
      const rules = specs[p.id], evals = []; let fired = -1;
      for (let i = 0; i < rules.length; i++) { const ok = holds(st, p.id, rules[i]); evals.push(ok); if (ok) { fired = i; break; } }
      const shadowed = [];
      for (let i = fired + 1; fired >= 0 && i < rules.length; i++) if (holds(st, p.id, rules[i])) shadowed.push(i);
      const r = fired >= 0 ? rules[fired] : null;
      let triggered = false;
      if (r) switch (r.act) {
        case 'trigger': triggered = true; if (dist(st.v, M.pos.jump) <= NEAR) scared = true; break;
        case 'spray': st.fog = true; break;
        case 'stop': st.fog = false; break;
        case 'light_off': st.light = false; break;
        case 'light_on': st.light = true; break;
      }
      turns.push({ id: p.id, evals, fired, shadowed });
      if (!violation && p.id === 'jump' && triggered && dist(st.v, M.pos.jump) <= ADJ) violation = { prop: 'S2', by: 'jump', line: fired };
      if (!violation && st.fog && !st.light) violation = { prop: 'S1', by: p.id, line: fired };
      if (violation) break;
    }
    return { st, turns, violation, scared };
  }
  const key = (s) => `${s.v.x},${s.v.y},${+s.fog},${+s.light}`;
  // Exhaustive check: BFS over (tick, visitor position, prop state). Shortest counterexample per property,
  // plus the number of distinct visitor paths covered and how many of them still get a scare.
  function check(specs) {
    const init = { v: M.start, fog: false, light: true, tick: 0 };
    let layer = new Map([[key(init) + ',0', { st: init, paths: 1, scaredPaths: 0, trail: [] }]]);
    const found = {}; let total = 0, scaredTotal = 0;
    for (let t = 1; t <= TICKS; t++) {
      const next = new Map();
      for (const node of layer.values()) {
        for (const to of moves(node.st.v)) {
          const r = step(node.st, to, specs);
          const trail = node.trail.concat([to]);
          if (r.violation) {
            if (!found[r.violation.prop]) found[r.violation.prop] = { tick: t, trail, ...r.violation };
            continue;
          }
          const sc = r.scared;
          const k = key(r.st) + ',' + (sc ? 1 : 0);
          const prev = next.get(k);
          const add = { paths: node.paths, scaredPaths: sc ? node.paths : node.scaredPaths };
          if (prev) { prev.paths += add.paths; prev.scaredPaths += add.scaredPaths; }
          else next.set(k, { st: r.st, paths: add.paths, scaredPaths: add.scaredPaths, trail });
        }
      }
      // collapse the "scared this tick" flag; scaredPaths already accumulates paths scared at least once
      layer = new Map();
      for (const [k, n] of next) {
        const k2 = k.slice(0, k.lastIndexOf(','));
        const p = layer.get(k2);
        if (p) { p.paths += n.paths; p.scaredPaths += n.scaredPaths; } else layer.set(k2, { ...n });
      }
    }
    for (const n of layer.values()) { total += n.paths; scaredTotal += n.scaredPaths; }
    return { found, safePaths: total, scaredPaths: scaredTotal };
  }
  // Replay one visitor trail with full traces, for the CCTV view.
  function replay(specs, trail) {
    let st = { v: M.start, fog: false, light: true, tick: 0 };
    const frames = [{ st, turns: [], violation: null }];
    for (const to of trail) {
      const r = step(st, to, specs); st = r.st; frames.push({ st, turns: r.turns, violation: r.violation, scared: r.scared });
      if (r.violation) break;
    }
    return frames;
  }
  root.SC = { TICKS, NEAR, ADJ, MAP, M, PROPS, CARDS, SAFETY, ruleText, check, replay, dist, moves };
})(typeof window !== 'undefined' ? window : globalThis);
