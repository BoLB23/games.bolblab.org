import { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { client, devLogin, getDevelopmentUsers } from './api';
import { useAuth } from './auth';
import { CapabilityTags, GameArt, GameCard } from './components';

function Loading({ label = 'Loading…' }: { label?: string }) { return <p className="state">{label}</p>; }
function ErrorState({ children }: { children: React.ReactNode }) { return <p className="state error">{children}</p>; }

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth(); const location = useLocation();
  if (isLoading) return <Loading />;
  return user ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export function LoginPage() {
  const navigate = useNavigate(); const location = useLocation(); const { refetch, user } = useAuth();
  const users = useQuery({ queryKey: ['development-users'], queryFn: getDevelopmentUsers });
  const login = useMutation({ mutationFn: devLogin, onSuccess: async () => { await refetch(); navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true }); } });
  if (user) return <Navigate to="/" replace />;
  return <main className="narrow"><span className="kicker">Local development only</span><h1>Choose a development player</h1><p>This temporary login flow is not production authentication.</p>{users.isLoading && <Loading />}{users.isError && <ErrorState>Development users are unavailable. Run the database migration and seed commands.</ErrorState>}<div className="user-list">{users.data?.map((candidate) => <button key={candidate.id} className="user-choice" onClick={() => login.mutate(candidate.id)} disabled={login.isPending}><strong>{candidate.display_name}</strong><span>{candidate.email} {candidate.is_admin ? '· Administrator' : ''}</span></button>)}</div>{login.isError && <ErrorState>Login failed. Please select a seeded development user.</ErrorState>}</main>;
}

export function CatalogPage() {
  const games = useQuery({ queryKey: ['games'], queryFn: client.games.list });
  if (games.isLoading) return <Loading label="Opening the collection…" />;
  if (games.isError) return <ErrorState>We could not load the game catalog. Please try again shortly.</ErrorState>;
  const catalogGames = games.data ?? [];
  const featured = catalogGames.find((game) => game.is_featured);
  return <main><section className="hero"><span className="kicker">Private game collection</span><h1>Small worlds, ready when you are.</h1><p>A quiet shelf of independently built browser games for a handful of friends.</p></section>{featured && <section><h2>Featured now</h2><GameCard game={featured} /></section>}<section><h2>All games</h2><div className="game-grid">{catalogGames.length ? catalogGames.map((game) => <GameCard key={game.id} game={game} />) : <p className="state">No games are available yet.</p>}</div></section></main>;
}

export function GameDetailPage() {
  const { gameSlug = '' } = useParams(); const game = useQuery({ queryKey: ['game', gameSlug], queryFn: () => client.games.getBySlug(gameSlug) });
  if (game.isLoading) return <Loading />;
  if (game.isError) return <ErrorState>This game is not available. <Link to="/">Return to the collection</Link>.</ErrorState>;
  const currentGame = game.data;
  if (!currentGame) return <ErrorState>This game is unavailable.</ErrorState>;
  const playable = currentGame.status === 'playable';
  return <main className="detail"><Link to="/">← Back to collection</Link><div className="detail-grid"><GameArt game={currentGame} /><div><span className={`status ${currentGame.status}`}>{currentGame.status.replace('_', ' ')}</span><h1>{currentGame.title}</h1><p className="lede">{currentGame.description}</p><dl><div><dt>Version</dt><dd>{currentGame.version}</dd></div><div><dt>Players</dt><dd>{currentGame.minimum_players}–{currentGame.maximum_players}</dd></div></dl><CapabilityTags game={currentGame} />{playable ? <a className="button primary" href={currentGame.launch_url}>Launch game</a> : <p className="notice">This game is being prepared for the collection. Its existing project is not integrated yet.</p>}</div></div></main>;
}

export function ProfilePage() {
  const { user, signOut } = useAuth(); const navigate = useNavigate();
  if (!user) return null;
  const onLogout = async (event: FormEvent) => { event.preventDefault(); await signOut(); navigate('/login'); };
  return <main className="narrow"><span className="kicker">Player profile</span><h1>{user.display_name}</h1><dl><div><dt>Email</dt><dd>{user.email ?? 'Not provided'}</dd></div><div><dt>Role</dt><dd>{user.is_admin ? 'Administrator' : 'Player'}</dd></div><div><dt>Last login</dt><dd>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'This session'}</dd></div></dl><p className="notice">Cloud saves, statistics, and recently played games are planned, but are not implemented in this foundation.</p><form onSubmit={onLogout}><button>Log out</button></form></main>;
}

export function NotFoundPage() { return <main className="narrow"><h1>Page not found</h1><Link className="button" to="/">Return to the collection</Link></main>; }
