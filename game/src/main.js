// Boot: parse ?shot= and ?seed=, start the game, and report errors into the
// status line so a headless run can surface them with --dump-dom.
import { Game } from './game.js';

const status = document.getElementById('status');
window.addEventListener('error', e => {
  status.textContent = `ERROR: ${e.message} (${e.filename}:${e.lineno})`;
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const game = new Game(canvas, seed, !!shot);
window.__game = game;

if (shot) {
  try {
    game.stageShot(shot);
  } catch (err) {
    status.textContent = `SHOT ERROR: ${err.message}`;
  }
} else {
  document.getElementById('btn-continue').style.display = game.load() ? 'block' : 'none';
  game.run();
}
