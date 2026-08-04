import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth';
import { Layout } from './App';
import { CatalogPage, GameDetailPage, LoginPage, NotFoundPage, ProfilePage, RequireAuth } from './pages';
import './styles.css';

const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: '/', element: <RequireAuth><CatalogPage /></RequireAuth> },
  { path: '/login', element: <LoginPage /> },
  { path: '/games/:gameSlug', element: <RequireAuth><GameDetailPage /></RequireAuth> },
  { path: '/profile', element: <RequireAuth><ProfilePage /></RequireAuth> },
  { path: '*', element: <NotFoundPage /> },
] }]);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider></StrictMode>);
