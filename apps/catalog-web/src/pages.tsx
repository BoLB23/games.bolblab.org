import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  ClanRole,
  LeaderboardEntry,
  PlayerProfileResponse,
  PlayerUpdateInput,
  PlatformClanMember,
} from '@bolb23/game-client-sdk';
import { authMode, client, devLogin, getDevelopmentUsers, googleLoginUrl } from './api';
import { markGoogleLoginIntent, PLAYER_QUERY_KEY, useAuth } from './auth';
import { CapabilityTags, GameArt, GameCard, HAIRCUT_OPTIONS, PLAYER_PALETTES, PlayerAvatar, RoleBadge } from './components';

function Loading({ label = 'Loading…' }: { label?: string }) { return <p className="state">{label}</p>; }
function ErrorState({ children }: { children: React.ReactNode }) { return <p className="state error">{children}</p>; }

export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${rounded % 60}s`;
  return `${rounded}s`;
}

function parsePlatformDate(timestamp: string): Date {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? new Date(timestamp) : new Date(`${timestamp}Z`);
}

export function formatRelativeTime(timestamp: string | null, online = false): string {
  if (!timestamp) return 'Never seen';
  const date = parsePlatformDate(timestamp);
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (online) return 'Online now';
  if (elapsedSeconds < 120) return 'Just now';
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} minutes ago`;
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3600)} hours ago`;
  if (elapsedSeconds < 172_800) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Renders a score's "achieved at" moment in the viewer's own browser time zone (never UTC),
// showing a clock time for today and a short date otherwise.
export function formatLeaderboardTimestamp(date: Date): string {
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatLeaderboardValue(value: number, unit: string): string {
  // Always render timed boards in seconds, even if the source data is stored in milliseconds.
  if (unit === 'seconds' || unit === 'milliseconds') {
    const seconds = unit === 'milliseconds' ? value / 1000 : value;
    if (seconds < 60) return `${seconds.toFixed(2)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${(seconds % 60).toFixed(2).padStart(5, '0')}s`;
  }
  const suffix = unit === 'points' || unit === 'items' || unit === 'wins' ? '' : ` ${unit}`;
  return `${value.toLocaleString()}${suffix}`;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth(); const location = useLocation();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.needs_player_setup && location.pathname !== '/my-player') {
    return <Navigate to="/my-player" replace state={{ from: location.pathname, onboarding: true }} />;
  }
  return <>{children}</>;
}

export function LoginPage() {
  const navigate = useNavigate(); const location = useLocation(); const { refetch, user } = useAuth();
  const users = useQuery({ queryKey: ['development-users'], queryFn: getDevelopmentUsers });
  const login = useMutation({ mutationFn: devLogin, onSuccess: async () => {
    const currentUser = await refetch();
    navigate(currentUser?.needs_player_setup ? '/my-player' : (location.state as { from?: string } | null)?.from ?? '/', { replace: true });
  } });
  if (user) return <Navigate to="/" replace />;
  if (authMode === 'oidc') {
    const target = (location.state as { from?: string } | null)?.from ?? '/';
    return <main className="narrow"><span className="kicker">Private arcade</span><h1>Sign in to play</h1><p>Use your Google account to enter the arcade.</p><a className="button primary" href={googleLoginUrl(target)} onClick={markGoogleLoginIntent}>Continue with Google</a></main>;
  }
  return <main className="narrow"><span className="kicker">Local development only</span><h1>Choose a development player</h1><p>This temporary login flow is not production authentication.</p>{users.isLoading && <Loading />}{users.isError && <ErrorState>Development users are unavailable. Run the database migration and seed commands.</ErrorState>}<div className="user-list">{users.data?.map((candidate) => <button key={candidate.id} className="user-choice" onClick={() => login.mutate(candidate.id)} disabled={login.isPending}><strong>{candidate.display_name}</strong><span>{candidate.email} · {candidate.role}</span></button>)}</div>{login.isError && <ErrorState>Login failed. Please select a seeded development user.</ErrorState>}</main>;
}

export function HomePage() {
  return <main><section className="hero"><span className="kicker">Underground Heat Studios · The private arcade</span><h1>Old friends.<br /><span>New games.</span><br />Same rivalries.</h1><p>Small browser games, strange little worlds, and unnecessary amounts of competition—built exclusively for the crew.</p><Link className="button hero-action" to="/games">Start Playing <span>↘</span></Link></section></main>;
}

export function GamesPage() {
  const games = useQuery({ queryKey: ['games'], queryFn: client.games.list });
  if (games.isLoading) return <Loading label="Opening the collection…" />;
  if (games.isError) return <ErrorState>We could not load the game catalog. Please try again shortly.</ErrorState>;
  const catalogGames = games.data ?? [];
  const featured = catalogGames.find((game) => game.is_featured);
  return <main className="games-page"><div className="page-intro"><span className="kicker">The private arcade · choose your run</span><h1>Pick a game.</h1><p className="lede">Small browser games, strange little worlds, and unnecessary amounts of competition—built exclusively for the crew.</p></div>{featured && <section className="featured-section"><div className="section-heading"><span className="section-index">01</span><h2>Featured now</h2></div><GameCard game={featured} /></section>}<section id="games"><div className="section-heading"><span className="section-index">02</span><h2>The lineup</h2></div><div className="game-grid">{catalogGames.length ? catalogGames.map((game) => <GameCard key={game.id} game={game} />) : <p className="state">No games are available yet.</p>}</div></section></main>;
}

function CompactLeaderboardPreview({ gameSlug }: { gameSlug: string }) {
  const definitions = useQuery({ queryKey: ['game-leaderboards', gameSlug], queryFn: () => client.leaderboards.forGame(gameSlug) });
  const first = definitions.data?.[0];
  const board = useQuery({ queryKey: ['leaderboard-preview', gameSlug, first?.key], queryFn: () => client.leaderboards.get(first!.key, gameSlug, 3), enabled: Boolean(first) });
  if (definitions.isLoading || !first || board.isLoading || board.isError || !board.data) return null;
  return <section className="compact-leaderboard"><div className="section-heading"><span className="section-index">03</span><h2>{first.display_name}</h2><Link to={`/leaderboards?game=${encodeURIComponent(gameSlug)}&board=${encodeURIComponent(first.key)}`}>Full board →</Link></div>{board.data.entries.length ? <ol className="compact-ranks">{board.data.entries.map((entry) => <li key={entry.id}><span>#{entry.rank}</span><PlayerAvatar appearance={entry.appearance} size="small" label={`${entry.nickname}, rank ${entry.rank}`} /><strong>{entry.nickname}</strong><b>{formatLeaderboardValue(entry.value, first.unit)}</b></li>)}</ol> : <p className="state">No scores logged yet.</p>}</section>;
}

export function GameDetailPage() {
  const { gameSlug = '' } = useParams(); const game = useQuery({ queryKey: ['game', gameSlug], queryFn: () => client.games.getBySlug(gameSlug) });
  if (game.isLoading) return <Loading />;
  if (game.isError) return <ErrorState>This game is not available. <Link to="/games">Return to the collection</Link>.</ErrorState>;
  const currentGame = game.data;
  if (!currentGame) return <ErrorState>This game is unavailable.</ErrorState>;
  const playable = currentGame.status === 'playable';
  return <main className="detail"><Link to="/games">← Back to collection</Link><div className="detail-grid"><GameArt game={currentGame} /><div><span className={`status ${currentGame.status}`}>{currentGame.status.replace('_', ' ')}</span><h1>{currentGame.title}</h1><p className="lede">{currentGame.description}</p><dl><div><dt>Version</dt><dd>{currentGame.version}</dd></div><div><dt>Players</dt><dd>{currentGame.minimum_players}–{currentGame.maximum_players}</dd></div></dl><CapabilityTags game={currentGame} />{playable ? <a className="button primary" href={currentGame.launch_url} target="_blank" rel="noopener noreferrer">Launch game</a> : <p className="notice">This game is being prepared for the collection. Its existing project is not integrated yet.</p>}</div></div>{playable && currentGame.supports_leaderboards && <CompactLeaderboardPreview gameSlug={currentGame.slug} />}</main>;
}

type PlayerDraft = Pick<PlayerProfileResponse, 'nickname' | 'haircut' | 'hair_color' | 'tshirt_color' | 'pants_color' | 'shoe_color'>;

export function MyPlayerPage() {
  const queryClient = useQueryClient(); const { user, refetch: refetchCurrentUser } = useAuth();
  const player = useQuery({ queryKey: PLAYER_QUERY_KEY(user?.id ?? 'anonymous'), queryFn: client.players.getCurrent, enabled: Boolean(user) });
  const [draft, setDraft] = useState<PlayerDraft | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [completedOnboarding, setCompletedOnboarding] = useState(false);
  useEffect(() => {
    if (player.data) {
      setDraft({ nickname: player.data.nickname, haircut: player.data.haircut, hair_color: player.data.hair_color, tshirt_color: player.data.tshirt_color, pants_color: player.data.pants_color, shoe_color: player.data.shoe_color });
    }
  }, [player.data]);
  const save = useMutation({
    mutationFn: async (input: PlayerUpdateInput) => {
      const currentUser = await refetchCurrentUser();
      if (!currentUser || currentUser.id !== user?.id) {
        throw new Error('Your account changed in another tab. Reloaded your session; please review this player before saving.');
      }
      return client.players.update(input);
    },
    onSuccess: async (saved) => {
      if (!user) return;
      queryClient.setQueryData(PLAYER_QUERY_KEY(user.id), saved);
      setDraft(saved);
      setValidationError(null);
      const completedUser = await refetchCurrentUser();
      if (user.needs_player_setup && completedUser && !completedUser.needs_player_setup) setCompletedOnboarding(true);
    },
  });
  if (player.isLoading || !draft) return <main><Loading label="Calling your player out of the tunnel…" /></main>;
  if (player.isError) return <main><ErrorState>We could not load your player. Please try again.</ErrorState></main>;
  const update = <K extends keyof PlayerDraft>(field: K, value: PlayerDraft[K]) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const cycleHaircut = (direction: number) => {
    const currentIndex = HAIRCUT_OPTIONS.findIndex((option) => option.key === draft.haircut);
    const nextIndex = (currentIndex + direction + HAIRCUT_OPTIONS.length) % HAIRCUT_OPTIONS.length;
    update('haircut', HAIRCUT_OPTIONS[nextIndex].key);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nickname = draft.nickname.trim();
    if (!nickname) { setValidationError('Give your player a nickname.'); return; }
    if (nickname.length >= 10) { setValidationError('Nicknames are limited to 9 characters.'); return; }
    save.mutate({ nickname, haircut: draft.haircut, hair_color: draft.hair_color, tshirt_color: draft.tshirt_color, pants_color: draft.pants_color, shoe_color: draft.shoe_color });
  };
  const error = validationError ?? (save.error instanceof Error ? save.error.message : null);
  const isOnboarding = user?.needs_player_setup;
  return <main className="player-page"><div className="page-intro"><span className="kicker">{isOnboarding ? 'Welcome to the arcade' : 'My player · shared across the arcade'}</span><h1>{isOnboarding ? 'Create your character.' : 'Make them yours.'}</h1><p className="lede">This is the face your friends will see on every leaderboard and, eventually, inside every game.</p></div><form className="player-editor" onSubmit={submit}><section className="player-preview-panel"><span className="eyebrow">Live preview</span><PlayerAvatar appearance={{ ...draft, nickname: draft.nickname || 'Player' }} size="large" label={`${draft.nickname || 'Player'} preview`} /><strong className="preview-name">{draft.nickname || 'Player'}</strong><span className="preview-note">Your arcade identity</span></section><section className="player-controls"><label className="field-label" htmlFor="nickname">Nickname <span>{draft.nickname.length}/9</span></label><input id="nickname" value={draft.nickname} maxLength={9} onChange={(event) => update('nickname', event.target.value)} aria-describedby="nickname-help" autoComplete="off" /><small id="nickname-help">Trimmed on save · fewer than 10 characters</small><div className="editor-control"><span className="field-label">Haircut</span><div className="cycle-control"><button type="button" aria-label="Previous haircut" onClick={() => cycleHaircut(-1)}>←</button><strong>{HAIRCUT_OPTIONS.find((option) => option.key === draft.haircut)?.label ?? draft.haircut}</strong><button type="button" aria-label="Next haircut" onClick={() => cycleHaircut(1)}>→</button></div></div>{(['hair_color', 'tshirt_color', 'pants_color', 'shoe_color'] as const).map((field) => <fieldset className="palette-control" key={field}><legend>{field === 'tshirt_color' ? 'T-shirt' : field.replace('_color', '').replace(/^./, (letter) => letter.toUpperCase())}</legend><div className="swatches">{PLAYER_PALETTES[field].map((color) => <button key={color} type="button" className={`swatch ${draft[field] === color ? 'selected' : ''}`} style={{ backgroundColor: color }} aria-label={`Choose ${field.replace('_color', '')} color ${color}`} aria-pressed={draft[field] === color} onClick={() => update(field, color)} />)}</div></fieldset>)}{error && <p className="state error" role="alert">{error}</p>}{save.isSuccess && !error && <p className="save-success" role="status">{completedOnboarding ? 'Character created. You are ready for the next run.' : 'Saved. Your player is ready for the next run.'}</p>}<button className="save-button" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : isOnboarding ? 'Create character' : 'Save player'}</button></section></form></main>;
}

const ROLE_OPTIONS: ClanRole[] = ['peon', 'member', 'staff', 'overlord'];

function ClanMemberCard({ member, canEditRole, onRoleChange, rolePending }: { member: PlatformClanMember; canEditRole: boolean; onRoleChange: (role: ClanRole) => void; rolePending: boolean }) {
  const lastSeen = member.last_seen_at ? parsePlatformDate(member.last_seen_at) : null;
  return <article className={`clan-member ${member.is_online ? 'is-online' : ''}`}><div className="clan-member-header"><PlayerAvatar appearance={member.appearance} size="medium" label={`${member.nickname}, ${member.role}`} /><div className="clan-identity"><div className="member-name-line"><h3>{member.nickname}</h3><span className={`presence-dot ${member.is_online ? 'online' : 'offline'}`} title={member.is_online ? 'Online now' : 'Offline'} aria-label={member.is_online ? 'Online now' : 'Offline'} /></div><p>{member.display_name}</p><RoleBadge role={member.role} /></div></div><div className="presence-line"><span>{formatRelativeTime(member.last_seen_at, member.is_online)}</span>{lastSeen && <time dateTime={member.last_seen_at ?? undefined} title={lastSeen.toLocaleString()}>· {lastSeen.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}</div><dl className="member-stats"><div><dt>Total time</dt><dd>{formatDuration(member.total_playtime_seconds)}</dd></div><div><dt>Last game</dt><dd>{member.most_recent_game?.game_title ?? 'No runs yet'}</dd></div></dl>{member.games.length > 0 && <details className="game-time-details"><summary>Time by game</summary><ul>{member.games.map((game) => <li key={game.game_slug}><span>{game.game_title}</span><strong>{formatDuration(game.playtime_seconds)}</strong></li>)}</ul></details>}{canEditRole && <label className="role-editor">Change role<select value={member.role} disabled={rolePending} onChange={(event) => onRoleChange(event.target.value as ClanRole)}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>}</article>;
}

export function ClanPage() {
  const { user } = useAuth(); const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['clan-members'], queryFn: client.clan.list });
  const updateRole = useMutation({ mutationFn: ({ userId, role }: { userId: string; role: ClanRole }) => client.clan.updateRole(userId, role), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['clan-members'] }); } });
  if (members.isLoading) return <main><Loading label="Checking who is in the room…" /></main>;
  if (members.isError) return <main><ErrorState>The clan board is unavailable right now.</ErrorState></main>;
  const clan = [...(members.data ?? [])].sort((left, right) => {
    if (left.is_online !== right.is_online) return left.is_online ? -1 : 1;
    return left.display_name.localeCompare(right.display_name);
  });
  return <main className="clan-page"><div className="page-intro"><span className="kicker">My clan · {clan.length} crew members</span><h1>The crew.</h1><p className="lede">Longtime friends, fresh rivalries. Presence is based on the last platform heartbeat, not a guess in the browser.</p></div><div className="clan-grid">{clan.map((member) => <ClanMemberCard key={member.user_id} member={member} canEditRole={user?.role === 'overlord' && user.id !== member.user_id} rolePending={updateRole.isPending} onRoleChange={(role) => updateRole.mutate({ userId: member.user_id, role })} />)}</div>{updateRole.isError && <ErrorState>That role change did not stick. Try again.</ErrorState>}</main>;
}

function LeaderboardRow({ entry, unit, current }: { entry: LeaderboardEntry; unit: string; current: boolean }) {
  const achieved = parsePlatformDate(entry.achieved_at);
  return <li className={`leaderboard-row rank-${Math.min(entry.rank, 3)} ${current ? 'is-current' : ''}`}><span className="rank-number">{String(entry.rank).padStart(2, '0')}</span><PlayerAvatar appearance={entry.appearance} size="small" label={`${entry.nickname}, rank ${entry.rank}`} /><div className="leaderboard-player"><strong>{entry.nickname}</strong><span>{entry.display_name}</span></div><RoleBadge role={entry.role} /><strong className="leaderboard-value">{formatLeaderboardValue(entry.value, unit)}</strong><time dateTime={entry.achieved_at} title={`${formatRelativeTime(entry.achieved_at)} · ${achieved.toLocaleString()}`}>{formatLeaderboardTimestamp(achieved)}</time></li>;
}

export function LeaderboardsPage() {
  const definitions = useQuery({ queryKey: ['leaderboards'], queryFn: client.leaderboards.list });
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedGame, setSelectedGame] = useState(() => searchParams.get('game') ?? '');
  const [selectedKey, setSelectedKey] = useState(() => searchParams.get('board') ?? '');
  const games = useMemo(() => [...new Map((definitions.data ?? []).map((definition) => [definition.game_slug, definition.game_title])).entries()], [definitions.data]);
  const filtered = useMemo(() => (definitions.data ?? []).filter((definition) => !selectedGame || definition.game_slug === selectedGame), [definitions.data, selectedGame]);
  useEffect(() => {
    if (!selectedGame && games[0]) setSelectedGame(games[0][0]);
  }, [games, selectedGame]);
  useEffect(() => {
    if (filtered.length && !filtered.some((definition) => definition.key === selectedKey)) setSelectedKey(filtered[0].key);
  }, [filtered, selectedKey]);
  const selected = filtered.find((definition) => definition.key === selectedKey) ?? filtered[0];
  useEffect(() => {
    if (!selected) return;
    const next = new URLSearchParams({ game: selected.game_slug, board: selected.key });
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [searchParams, selected, setSearchParams]);
  const board = useQuery({ queryKey: ['leaderboard', selected?.game_slug, selected?.key], queryFn: () => client.leaderboards.get(selected!.key, selected!.game_slug, 50), enabled: Boolean(selected) });
  if (definitions.isLoading) return <main><Loading label="Pulling the latest rivalries…" /></main>;
  if (definitions.isError) return <main><ErrorState>Leaderboards are unavailable right now.</ErrorState></main>;
  return <main className="leaderboards-page"><div className="page-intro"><span className="kicker">Leaderboards · the receipts</span><h1>Who’s up?</h1><p className="lede">Every number is submitted by a game, checked by the platform, and attached to the player who earned it.</p></div>{!definitions.data?.length ? <p className="state">No games have published a leaderboard yet.</p> : <><div className="leaderboard-selectors"><label>Game<select value={selectedGame} onChange={(event) => { setSelectedGame(event.target.value); setSelectedKey(''); }}>{games.map(([slug, title]) => <option key={slug} value={slug}>{title}</option>)}</select></label><label>Board<select value={selected?.key ?? ''} onChange={(event) => setSelectedKey(event.target.value)}>{filtered.map((definition) => <option key={definition.key} value={definition.key}>{definition.display_name}</option>)}</select></label></div>{selected && <section className="leaderboard-board"><div className="board-header"><div><span className="eyebrow">{selected.game_title} · {selected.unit}</span><h2>{selected.display_name}</h2><p>{selected.description}</p></div><span className="aggregation-note">{selected.aggregation === 'max' ? 'Best score' : selected.aggregation === 'min' ? 'Best time' : selected.aggregation === 'latest' ? 'Latest result' : 'Cumulative'}</span></div>{board.isLoading && <Loading label="Sorting the board…" />}{board.isError && <ErrorState>We could not load this board.</ErrorState>}{board.data && (board.data.entries.length ? <ol className="leaderboard-list">{board.data.entries.map((entry) => <LeaderboardRow key={entry.id} entry={entry} unit={selected.unit} current={entry.user_id === board.data?.current_user_entry?.user_id} />)}</ol> : <p className="state">No entries yet. Be the first name on the board.</p>)}{board.data?.current_user_entry && board.data.current_user_rank && board.data.current_user_rank > board.data.entries.length && <p className="your-standing">Your standing: <strong>#{board.data.current_user_rank}</strong> · {formatLeaderboardValue(board.data.current_user_entry.value, selected.unit)}</p>}</section>}</>}</main>;
}

export function ProfilePage() {
  const { user, signOut } = useAuth(); const navigate = useNavigate(); const [logoutError, setLogoutError] = useState<string | null>(null);
  if (!user) return null;
  const onLogout = async (event: FormEvent) => { event.preventDefault(); setLogoutError(null); try { await signOut(); navigate('/login'); } catch { setLogoutError('Could not log out. Please try again.'); } };
  return <main className="narrow"><span className="kicker">Account profile</span><h1>{user.display_name}</h1><dl><div><dt>Email</dt><dd>{user.email ?? 'Not provided'}</dd></div><div><dt>Clan role</dt><dd><RoleBadge role={user.role} /></dd></div><div><dt>Last login</dt><dd>{user.last_login_at ? parsePlatformDate(user.last_login_at).toLocaleString() : 'This session'}</dd></div></dl><p className="notice">Your shared appearance lives in <Link to="/my-player">My Player</Link>. Games can read it through the platform SDK without knowing how authentication works.</p>{logoutError && <ErrorState>{logoutError}</ErrorState>}<form onSubmit={onLogout}><button>Log out</button></form></main>;
}

export function NotFoundPage() { return <main className="narrow"><h1>Page not found</h1><Link className="button" to="/games">Return to the collection</Link></main>; }
