import { levelInfo } from '../content';
import type { Mount } from '../app';
import { el } from './dom';

/** A placeholder until the play screen is built. */
export const mountPlay: Mount = (root, services, _go, route) => {
  const doc = root.ownerDocument;
  const level = services.levels.find((l) => route.screen === 'night' && l.id === route.id)!;
  const page = el(doc, 'main', 'play');
  page.append(el(doc, 'h2', '', `${level.name}: ${levelInfo(level).concept}`));
  root.append(page);
  return { destroy: () => {} };
};
