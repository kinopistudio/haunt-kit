import { levelInfo } from '../content';
import { hashFor } from '../route';
import type { Mount } from '../app';
import { el, muteButton } from './dom';

/** The level select: one folio for each night. None is locked, and a cleared night says so in words as well as in gold. */
export const mountLevels: Mount = (root, services, go) => {
  const doc = root.ownerDocument;
  const page = el(doc, 'main', 'nights-screen');
  const bar = el(doc, 'header', 'screen-bar');
  const back = el(doc, 'a', 'btn', '\u2039 Title');
  back.setAttribute('href', hashFor({ screen: 'title' }));
  const title = el(doc, 'h2', '', 'Choose a night');
  const mute = muteButton(doc, services);
  bar.append(back, title, mute.button);

  const list = el(doc, 'ol', 'folios');
  for (const level of services.levels) {
    const info = levelInfo(level);
    const cleared = services.progress.isCleared(level.id);
    const item = el(doc, 'li');
    const folio = el(doc, 'a', `folio${cleared ? ' cleared' : ''}`);
    folio.setAttribute('href', hashFor({ screen: 'night', id: level.id }));
    folio.dataset.level = level.id;
    folio.append(
      el(doc, 'span', 'folio-label', level.id === 'prologue' ? 'Before' : 'Night'),
      el(doc, 'span', 'folio-numeral', info.numeral),
      el(doc, 'span', 'folio-concept', info.concept),
      el(doc, 'span', 'folio-lesson', info.lesson),
      el(doc, 'span', 'folio-state', cleared ? '\u2713 Cleared' : 'Not yet cleared'),
    );
    item.append(folio);
    list.append(item);
  }
  page.append(bar, list);
  root.append(page);
  void go;
  return { destroy: () => mute.destroy() };
};
