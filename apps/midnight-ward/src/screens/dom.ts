import type { Services } from '../app';

/** Creates an element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** The sound toggle. It unlocks the audio on the click, and follows the setting when another button changes it. */
export function muteButton(doc: Document, services: Services): { button: HTMLButtonElement; destroy: () => void } {
  const button = el(doc, 'button', 'btn mute');
  button.type = 'button';
  button.setAttribute('aria-label', 'Sound');
  const render = (muted: boolean): void => {
    button.textContent = muted ? 'Sound off' : 'Sound on';
    button.setAttribute('aria-pressed', String(!muted));
  };
  render(services.sfx.muted);
  button.addEventListener('click', () => {
    services.sfx.unlock();
    services.setMuted(!services.sfx.muted);
  });
  const stop = services.onMute(render);
  return { button, destroy: stop };
}
