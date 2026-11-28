/** `''` is the ubiquitous form (`THE x SHALL y`). */
export type Keyword = '' | 'WHEN' | 'IF';

/**
 * One EARS rule. `cond` is a registered condition id or `'always'`, `act` is a registered
 * action id, and `n` is set exactly when the condition's phrase pattern has `{n}`.
 * Invariant: `kw === ''` exactly when `cond === 'always'`.
 */
export interface Rule {
  kw: Keyword;
  cond: string;
  act: string;
  n?: number;
}

/** A scheduled rewrite: at `tick`, `actor` writes `rule` into its own spec at 1-based `line`. */
export interface ScheduledEvent {
  tick: number;
  actor: string;
  line: number;
  rule: Rule;
}

/**
 * A safety rule: `THE <actor> SHALL NOT <prohibition> WHILE <condition>.` `prohibited` is a registered
 * prohibition id and `cond` a registered condition id. `n` is set exactly when the condition's phrase has `{n}`.
 */
export interface SafetyRule {
  actor: string;
  prohibited: string;
  cond: string;
  n?: number;
}

export type Sentence =
  | { type: 'rule'; actor: string; rule: Rule }
  | { type: 'write'; event: ScheduledEvent }
  | { type: 'safety'; rule: SafetyRule };

/** `column` is 1-based. */
export interface ParseError {
  message: string;
  column: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

export interface SpecSet {
  actors: Record<string, Rule[]>;
  events: ScheduledEvent[];
  /** Safety rules in file order. They are not lines of any actor's spec. */
  safety: SafetyRule[];
}

/** `line` is the 1-based line number in the spec file. */
export interface SpecError extends ParseError {
  line: number;
  text: string;
}

/** The condition id of the ubiquitous form. It has no phrase. */
export const ALWAYS = 'always';
