import { buildWorld, PROLOGUE } from '../levels';
import { recordRun } from 'haunt-kit';
import { createRegistry } from '../vocab';
import type { Mount } from '../app';
import { el, muteButton } from './dom';

/** How long the wisp takes for each step of its walk on the title screen, in milliseconds. */
const STEP_MS = 900;

/**
 * The title: the name, the line, and behind them the Prologue's ward, where a wisp walks toward the sleeping girl,
 * step by step, over and over. The walk is the engine's own recording of the Prologue with nothing placed.
 */
export const mountTitle: Mount = (root, services, go) => {
  const doc = root.ownerDocument;
  const page = el(doc, 'main', 'title');
  const canvas = el(doc, 'canvas', 'title-stage');
  canvas.setAttribute('aria-hidden', 'true');
  const card = el(doc, 'div', 'title-card');
  const kicker = el(doc, 'p', 'kicker', 'A Haunt Kit game');
  const heading = el(doc, 'h1', '', 'Midnight Ward');
  const tagline = el(doc, 'p', 'tagline', 'A ghost that obeys its spec.');
  const blurb = el(doc, 'p', 'blurb', 'Read the spec. Write the rule. Survive twelve bells.');
  const actions = el(doc, 'div', 'title-actions');
  const begin = el(doc, 'button', 'btn primary big', 'Begin');
  begin.type = 'button';
  begin.addEventListener('click', () => {
    services.sfx.unlock();
    services.sfx.toll();
    go({ screen: 'nights' });
  });
  const mute = muteButton(doc, services);
  actions.append(begin, mute.button);
  card.append(kicker, heading, tagline, blurb, actions);
  page.append(canvas, card);
  root.append(page);

  // The walk of the wisp: frames 0 to N - 2 of the empty Prologue, looped.
  const recording = recordRun(buildWorld(PROLOGUE, [], [], createRegistry()), createRegistry());
  const last = Math.max(1, recording.frames.length - 2);
  const scene = services.makeScene(canvas, recording.frames[0]!);
  scene.setPhase('night');
  const fit = (): void => scene.resize(Math.min(doc.defaultView?.innerWidth ?? 900, 1000));
  fit();
  let index = services.reduced() ? Math.min(4, last) : 0;
  scene.setWorld(recording.frames[index]!, { animate: false });
  scene.start();
  doc.defaultView?.addEventListener('resize', fit);

  let timer: ReturnType<typeof setInterval> | null = null;
  if (!services.reduced()) {
    timer = setInterval(() => {
      const wrap = index >= last;
      index = wrap ? 0 : index + 1;
      scene.setWorld(recording.frames[index]!, { animate: !wrap, tickMs: STEP_MS - 100 });
    }, STEP_MS);
  }

  return {
    destroy() {
      if (timer !== null) clearInterval(timer);
      scene.stop();
      mute.destroy();
      doc.defaultView?.removeEventListener('resize', fit);
    },
  };
};
