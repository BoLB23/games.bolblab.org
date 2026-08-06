import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playerGet: vi.fn(),
  playerUpdate: vi.fn(),
  clanList: vi.fn(),
  leaderboardList: vi.fn(),
  leaderboardGet: vi.fn(),
}));

vi.mock('../api', () => ({
  client: {
    players: { getCurrent: mocks.playerGet, update: mocks.playerUpdate },
    clan: { list: mocks.clanList },
    leaderboards: { list: mocks.leaderboardList, get: mocks.leaderboardGet },
  },
  getDevelopmentUsers: vi.fn(),
  devLogin: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({
    user: { id: 'pat', display_name: 'Pat Player', email: null, avatar_url: null, is_admin: false, role: 'member', last_login_at: null, last_seen_at: null },
    isLoading: false,
    refetch: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { ClanPage, formatLeaderboardValue, LeaderboardsPage, MyPlayerPage } from '../pages';

const appearance = { nickname: 'Pat', haircut: 'short', hair_color: '#2b1d13', tshirt_color: '#f05a28', pants_color: '#1b2330', shoe_color: '#f5efe4' };
const player = { id: 'profile', user_id: 'pat', ...appearance, created_at: '', updated_at: '' };

function renderPage(page: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.clearAllMocks());

describe('player, clan, and leaderboard surfaces', () => {
  it('updates the player preview and rejects an invalid nickname before saving', async () => {
    mocks.playerGet.mockResolvedValue(player);
    renderPage(<MyPlayerPage />);
    const nickname = await screen.findByLabelText(/Nickname/);
    const avatar = document.querySelector('.player-avatar');
    expect(avatar).toHaveClass('haircut-short');
    fireEvent.click(screen.getByRole('button', { name: 'Next haircut' }));
    expect(avatar).toHaveClass('haircut-fade');
    fireEvent.change(nickname, { target: { value: '1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save player' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('limited to 9 characters');
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });

  it('renders online and offline clan indicators from server state', async () => {
    mocks.clanList.mockResolvedValue([
      { user_id: 'pat', display_name: 'Pat Player', avatar_url: null, nickname: 'Pat', appearance, role: 'member', is_online: true, last_seen_at: new Date().toISOString(), total_playtime_seconds: 61, games: [], most_recent_game: null },
      { user_id: 'mara', display_name: 'Mara Member', avatar_url: null, nickname: 'Mara', appearance: { ...appearance, nickname: 'Mara' }, role: 'peon', is_online: false, last_seen_at: new Date(Date.now() - 86_400_000).toISOString(), total_playtime_seconds: 0, games: [], most_recent_game: null },
    ]);
    renderPage(<ClanPage />);
    expect(await screen.findByLabelText('Online now')).toBeInTheDocument();
    expect(screen.getByLabelText('Offline')).toBeInTheDocument();
  });

  it('formats leaderboard values and renders the ranked order', async () => {
    const definition = { id: 'board', game_id: 'game', game_slug: 'sample-game', game_title: 'Sample Game', key: 'orb-touches', display_name: 'Orb touches', description: 'Highest total', mission_key: null, unit: 'points', sort_direction: 'desc' as const, aggregation: 'max' as const, is_active: true, created_at: '', updated_at: '' };
    mocks.leaderboardList.mockResolvedValue([definition]);
    mocks.leaderboardGet.mockResolvedValue({ definition, entries: [
      { id: 'one', user_id: 'ada', rank: 1, nickname: 'Ada', display_name: 'Ada Admin', role: 'overlord', appearance, value: 48, metadata: null, achieved_at: new Date().toISOString(), submitted_at: new Date().toISOString() },
      { id: 'two', user_id: 'pat', rank: 2, nickname: 'Pat', display_name: 'Pat Player', role: 'member', appearance, value: 31, metadata: null, achieved_at: new Date().toISOString(), submitted_at: new Date().toISOString() },
    ], current_user_entry: null, current_user_rank: null });
    expect(formatLeaderboardValue(1234, 'points')).toBe('1,234');
    expect(formatLeaderboardValue(61.25, 'seconds')).toBe('1m 01.25s');
    renderPage(<LeaderboardsPage />);
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Ada');
    expect(rows[1]).toHaveTextContent('Pat');
  });
});
