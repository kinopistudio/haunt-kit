import { ALWAYS } from '../grammar/types';
import type { ActionDef, ConditionDef, PropertyDef, ProhibitionDef } from './types';

export class RegistryError extends Error {
  constructor(
    message: string,
    readonly id: string,
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

const ID_RE = /^[a-z][a-z0-9_]*$/;
/** Property ids may start with a capital letter, so that safety rules can be called `S1`. */
const PROPERTY_ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const WORD_RE = /^[a-z0-9][a-z0-9'-]*$/;
const PARAM = '{n}';
const MAX_DIGITS = 9;

/** Lowercase, trim, collapse runs of spaces. Used for patterns and for text being matched. */
export function normalizePhrase(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

interface Compiled<T> {
  def: T;
  regex: RegExp;
  hasParam: boolean;
  key: string;
}

function validateId(id: string, what: string, re: RegExp = ID_RE): void {
  if (!re.test(id)) throw new RegistryError(`${what} id "${id}" must match ${re}`, id);
}

/** Returns the normalised pattern, whether it has `{n}`, and a matching regex. */
function compilePattern(id: string, pattern: string, allowParam: boolean): { key: string; regex: RegExp; hasParam: boolean } {
  const key = normalizePhrase(pattern);
  if (key === '' || key !== pattern) {
    throw new RegistryError(`pattern of "${id}" must be lowercase words separated by single spaces: "${pattern}"`, id);
  }
  const words = key.split(' ');
  let params = 0;
  const parts = words.map((w) => {
    if (w === PARAM) {
      params++;
      return `(\\d{1,${MAX_DIGITS}})`;
    }
    if (!WORD_RE.test(w)) {
      throw new RegistryError(`pattern of "${id}" has an invalid word "${w}" (no commas, periods, quotes or braces)`, id);
    }
    return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  if (params > 1) throw new RegistryError(`pattern of "${id}" has more than one ${PARAM}`, id);
  if (params === 1 && !allowParam) throw new RegistryError(`pattern of "${id}" uses ${PARAM}, which only conditions may do`, id);
  return { key, regex: new RegExp(`^${parts.join(' ')}$`), hasParam: params === 1 };
}

export class Registry {
  private readonly conds = new Map<string, Compiled<ConditionDef>>();
  private readonly acts = new Map<string, Compiled<ActionDef>>();
  private readonly prohibits = new Map<string, Compiled<ProhibitionDef>>();
  private readonly props = new Map<string, PropertyDef>();
  private schedule: ConditionDef | undefined;

  addCondition(def: ConditionDef): this {
    validateId(def.id, 'condition');
    if (def.id === ALWAYS) throw new RegistryError(`"${ALWAYS}" is built in and cannot be registered`, def.id);
    if (this.conds.has(def.id)) throw new RegistryError(`condition "${def.id}" is already registered`, def.id);
    const c = compilePattern(def.id, def.pattern, true);
    for (const other of this.conds.values()) {
      if (other.key === c.key) throw new RegistryError(`condition "${def.id}" reuses the pattern of "${other.def.id}"`, def.id);
    }
    if (def.schedule) {
      if (!c.hasParam) throw new RegistryError(`schedule condition "${def.id}" needs ${PARAM} in its pattern`, def.id);
      if (this.schedule) throw new RegistryError(`condition "${def.id}" cannot be a schedule condition: "${this.schedule.id}" already is`, def.id);
      this.schedule = def;
    }
    this.conds.set(def.id, { def, regex: c.regex, hasParam: c.hasParam, key: c.key });
    return this;
  }

  addAction(def: ActionDef): this {
    validateId(def.id, 'action');
    if (this.acts.has(def.id)) throw new RegistryError(`action "${def.id}" is already registered`, def.id);
    const c = compilePattern(def.id, def.pattern, false);
    for (const other of this.acts.values()) {
      if (other.key === c.key) throw new RegistryError(`action "${def.id}" reuses the pattern of "${other.def.id}"`, def.id);
    }
    this.acts.set(def.id, { def, regex: c.regex, hasParam: false, key: c.key });
    return this;
  }

  addProhibition(def: ProhibitionDef): this {
    validateId(def.id, 'prohibition');
    if (this.prohibits.has(def.id)) throw new RegistryError(`prohibition "${def.id}" is already registered`, def.id);
    const c = compilePattern(def.id, def.pattern, false);
    for (const other of this.prohibits.values()) {
      if (other.key === c.key) throw new RegistryError(`prohibition "${def.id}" reuses the pattern of "${other.def.id}"`, def.id);
    }
    this.prohibits.set(def.id, { def, regex: c.regex, hasParam: false, key: c.key });
    return this;
  }

  addProperty(def: PropertyDef): this {
    validateId(def.id, 'property', PROPERTY_ID_RE);
    if (this.props.has(def.id)) throw new RegistryError(`property "${def.id}" is already registered`, def.id);
    this.props.set(def.id, def);
    return this;
  }

  condition(id: string): ConditionDef | undefined {
    return this.conds.get(id)?.def;
  }

  action(id: string): ActionDef | undefined {
    return this.acts.get(id)?.def;
  }

  prohibition(id: string): ProhibitionDef | undefined {
    return this.prohibits.get(id)?.def;
  }

  property(id: string): PropertyDef | undefined {
    return this.props.get(id);
  }

  /** Finds the condition whose pattern matches `text`. Returns the captured integer when there is one. */
  matchCondition(text: string): { def: ConditionDef; n?: number } | undefined {
    const key = normalizePhrase(text);
    for (const c of this.conds.values()) {
      const m = c.regex.exec(key);
      if (!m) continue;
      return c.hasParam ? { def: c.def, n: Number(m[1]) } : { def: c.def };
    }
    return undefined;
  }

  matchAction(text: string): ActionDef | undefined {
    const key = normalizePhrase(text);
    for (const c of this.acts.values()) if (c.regex.test(key)) return c.def;
    return undefined;
  }

  matchProhibition(text: string): ProhibitionDef | undefined {
    const key = normalizePhrase(text);
    for (const c of this.prohibits.values()) if (c.regex.test(key)) return c.def;
    return undefined;
  }

  /** The condition that triggers scheduled write sentences, if one is registered. */
  get scheduleCondition(): ConditionDef | undefined {
    return this.schedule;
  }

  /** True when the condition's pattern has `{n}`. */
  conditionHasParam(id: string): boolean {
    return this.conds.get(id)?.hasParam ?? false;
  }

  conditions(): readonly ConditionDef[] {
    return [...this.conds.values()].map((c) => c.def);
  }

  actions(): readonly ActionDef[] {
    return [...this.acts.values()].map((c) => c.def);
  }

  prohibitions(): readonly ProhibitionDef[] {
    return [...this.prohibits.values()].map((c) => c.def);
  }

  properties(): readonly PropertyDef[] {
    return [...this.props.values()];
  }
}
