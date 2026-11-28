import './styles.css';
import { Router, createServices } from './app';
import type { RouterHost } from './app';
import { mountLevels } from './screens/levels';
import { mountPlay } from './screens/play';
import { mountTitle } from './screens/title';

const root = document.getElementById('app');
if (root) {
  const services = createServices();

  // Browsers only let a page make sound after the player has used it.
  const unlock = (): void => services.sfx.unlock();
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  document.addEventListener('keydown', unlock, { once: true, capture: true });

  const host: RouterHost = {
    getHash: () => location.hash,
    setHash: (hash) => {
      location.hash = hash;
    },
    onChange: (listener) => {
      addEventListener('hashchange', listener);
      return () => removeEventListener('hashchange', listener);
    },
  };
  new Router(root, services, { title: mountTitle, nights: mountLevels, night: mountPlay }, host).start();
}
