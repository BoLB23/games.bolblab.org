import { createGamePlatformClient, GamePlatformApiError } from '@game-platform/game-client-sdk';
import './style.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const catalogUrl = import.meta.env.VITE_CATALOG_URL ?? 'http://localhost:5173';
const client = createGamePlatformClient({ apiBaseUrl });
const app = document.querySelector<HTMLElement>('#app');

if (!app) throw new Error('Missing game root');

let clicks = 0;
function render(content: string) { app!.innerHTML = content; }
function play() {
  const counter = app!.querySelector<HTMLButtonElement>('#orb');
  const score = app!.querySelector('#score');
  counter?.addEventListener('click', () => { clicks += 1; if (score) score.textContent = String(clicks); });
}

async function load() {
  render('<p class="loading">Connecting to the game platform…</p>');
  try {
    const [user, game] = await Promise.all([client.auth.getCurrentUser(), client.games.getBySlug('sample-game')]);
    render(`<a href="${catalogUrl}">← Back to catalog</a><p class="eyebrow">Independent browser game</p><h1>${game.title}</h1><p>Welcome, <strong>${user.display_name}</strong>. Click the orb. The counter exists only in this browser tab.</p><button id="orb" aria-label="Increase your in-memory score"><span>✦</span></button><p class="score">Orb touches: <output id="score">0</output></p>`);
    play();
  } catch (error) {
    const unauthenticated = error instanceof GamePlatformApiError && error.status === 401;
    render(`<a href="${catalogUrl}">← Back to catalog</a><h1>${unauthenticated ? 'Choose a player first' : 'Platform unavailable'}</h1><p>${unauthenticated ? 'Return to the catalog and use development authentication before opening this game.' : 'The game cannot reach its catalog API. Check that the API is running.'}</p>`);
  }
}
void load();
