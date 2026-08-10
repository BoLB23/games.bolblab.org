import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth';
import { Layout } from './App';
import { ClanPage, GamesPage, GameDetailPage, HomePage, LeaderboardsPage, LoginPage, MyPlayerPage, NotFoundPage, ProfilePage, RequireAuth } from './pages';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: '/', element: <RequireAuth><HomePage /></RequireAuth> },
  { path: '/login', element: <LoginPage /> },
  { path: '/games', element: <RequireAuth><GamesPage /></RequireAuth> },
  { path: '/games/:gameSlug', element: <RequireAuth><GameDetailPage /></RequireAuth> },
  { path: '/profile', element: <RequireAuth><ProfilePage /></RequireAuth> },
  { path: '/my-player', element: <RequireAuth><MyPlayerPage /></RequireAuth> },
  { path: '/clan', element: <RequireAuth><ClanPage /></RequireAuth> },
  { path: '/leaderboards', element: <RequireAuth><LeaderboardsPage /></RequireAuth> },
  { path: '*', element: <NotFoundPage /> },
] }]);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider></StrictMode>);
