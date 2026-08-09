import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GameCard } from '../components';
import { HomePage } from '../pages';

vi.mock('../api', () => ({ client: { auth: { getCurrentUser: vi.fn() }, games: { list: vi.fn(), getBySlug: vi.fn() } }, getDevelopmentUsers: vi.fn(), devLogin: vi.fn(), logout: vi.fn() }));
const game = { id: 'sample', slug: 'sample-game', title: 'Sample Game', short_description: 'A test game', description: 'Description', cover_image_url: null, launch_url: 'http://game.test', status: 'playable' as const, version: '0.1.0', minimum_players: 1, maximum_players: 1, supports_cloud_saves: false, supports_leaderboards: false, supports_multiplayer: false, is_featured: true, sort_order: 1, created_at: '', updated_at: '' };

describe('catalog game rendering', () => {
  it('renders a playable game with a launch action', () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><GameCard game={game} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute('href', 'http://game.test');
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Sample Game')).toBeInTheDocument();
  });

  it('disables a coming-soon game launch', () => {
    render(<MemoryRouter><GameCard game={{ ...game, status: 'coming_soon', title: 'Milton Estates' }} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Coming soon' })).toBeDisabled();
  });
});

describe('authenticated home screen', () => {
  it('keeps the title screen and sends Start Playing to the games page', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /old friends/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start playing/i })).toHaveAttribute('href', '/games');
  });
});
