import { createRegistry } from './vocab';

createRegistry();

const app = document.getElementById('app');
if (app) {
  app.innerHTML = '<h1>Scare Cue</h1><p>A safety check for home haunters.</p>';
}
