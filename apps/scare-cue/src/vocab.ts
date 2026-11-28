import { Registry } from 'haunt-kit';

/** Scare Cue's own words. They arrive with the scare-cue spec; until then the registry is empty. */
export function createRegistry(): Registry {
  return new Registry();
}
