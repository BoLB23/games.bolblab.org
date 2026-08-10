import { createGamePlatformClient, GamePlatformApiError, type GameSessionHandle, type PlatformPlayer } from '@bolb23/game-client-sdk';
import './style.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001/api/v1';
const catalogUrl = import.meta.env.VITE_CATALOG_URL ?? 'http://localhost:6183';
const client = createGamePlatformClient({ apiBaseUrl });
const app = document.querySelector<HTMLElement>('#app');

if (!app) throw new Error('Missing game root');

let clicks = 0;
let gameSession: GameSessionHandle | null = null;
let heartbeatTimer: number | undefined;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function avatarMarkup(player: PlatformPlayer): string {
  const haircut = ['short', 'fade', 'long', 'mohawk'].includes(player.haircut) ? player.haircut : 'short';
  const style = [
    `--avatar-hair:${safeColor(player.hairColor, '#2b1d13')}`,
    `--avatar-shirt:${safeColor(player.tshirtColor, '#f05a28')}`,
    `--avatar-pants:${safeColor(player.pantsColor, '#1b2330')}`,
    `--avatar-shoes:${safeColor(player.shoeColor, '#f5efe4')}`,
  ].join(';');
  return `<span class="game-avatar haircut-${haircut}" style="${style}" role="img" aria-label="${escapeHtml(player.nickname)}"><span class="game-avatar-hair"></span><span class="game-avatar-head"><i></i><i></i></span><span class="game-avatar-shirt"></span><span class="game-avatar-pants"></span><span class="game-avatar-shoe game-avatar-shoe-left"></span><span class="game-avatar-shoe game-avatar-shoe-right"></span></span>`;
}

function render(content: string) { app!.innerHTML = content; }

function showStatus(message: string, error = false) {
  const status = app?.querySelector<HTMLElement>('#session-status');
  if (status) { status.textContent = message; status.className = error ? 'session-status error' : 'session-status'; }
}

async function bankScore() {
  const submit = app?.querySelector<HTMLButtonElement>('#submit-score');
  if (submit) submit.disabled = true;
  try {
    await client.submitLeaderboardEntry('sample-game', { leaderboardKey: 'orb-touches', value: clicks, metadata: { source: 'sample-game' } });
    showStatus(`Score banked: ${clicks} orb touch${clicks === 1 ? '' : 'es'}. Check the leaderboard.`);
  } catch {
    showStatus('The board rejected that score. Keep the run local for now.', true);
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function endSession() {
  const end = app?.querySelector<HTMLButtonElement>('#end-session');
  if (end) end.disabled = true;
  if (!gameSession) { showStatus('No active session.'); return; }
  try {
    await gameSession.end();
    gameSession = null;
    if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
    showStatus('Run ended. Only credited heartbeat time was recorded.');
  } catch {
    showStatus('The run could not be closed cleanly.', true);
    if (end) end.disabled = false;
  }
}

function play() {
  const counter = app!.querySelector<HTMLButtonElement>('#orb');
  const score = app!.querySelector('#score');
  counter?.addEventListener('click', () => { clicks += 1; if (score) score.textContent = String(clicks); });
  app!.querySelector<HTMLButtonElement>('#submit-score')?.addEventListener('click', () => { void bankScore(); });
  app!.querySelector<HTMLButtonElement>('#end-session')?.addEventListener('click', () => { void endSession(); });
  heartbeatTimer = window.setInterval(() => {
    void gameSession?.heartbeat().catch(() => showStatus('Session heartbeat missed; the platform will cap idle time.', true));
  }, 45_000);
  window.addEventListener('beforeunload', () => { void gameSession?.end(); }, { once: true });
}

async function load() {
  render('<p class="loading">Connecting to the game platform…</p>');
  try {
    const [user, player, game] = await Promise.all([
      client.auth.getCurrentUser(),
      client.getCurrentPlayer(),
      client.games.getBySlug('sample-game'),
    ]);
    gameSession = await client.startGameSession('sample-game');
    render(`<main><a class="exit-game" href="${catalogUrl}">← Exit to catalog</a><div class="game-player-line">${avatarMarkup(player)}<span><span class="eyebrow">Your shared player</span><strong>${escapeHtml(player.nickname)}</strong></span></div><p class="eyebrow">Independent browser game</p><h1>${escapeHtml(game.title)}</h1><p>Welcome, <strong>${escapeHtml(user.display_name)}</strong>. Click the orb, bank a sample statistic, and then close the run.</p><button id="orb" aria-label="Increase your in-memory score"><span>✦</span></button><p class="score">Orb touches: <output id="score">0</output></p><div class="game-actions"><button id="submit-score" class="secondary">Bank score</button><button id="end-session" class="secondary">End session</button></div><p id="session-status" class="session-status">Session active · heartbeat every 45 seconds</p></main>`);
    play();
  } catch (error) {
    const unauthenticated = error instanceof GamePlatformApiError && error.status === 401;
    render(`<main><a class="exit-game" href="${catalogUrl}">← Exit to catalog</a><h1>${unauthenticated ? 'Choose a player first' : 'Platform unavailable'}</h1><p>${unauthenticated ? 'Return to the catalog and use development authentication before opening this game.' : 'The game cannot reach its catalog API. Check that the API is running and the database is seeded.'}</p></main>`);
  }
}
void load();
