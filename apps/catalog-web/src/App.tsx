import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { client } from './api';
import { useAuth } from './auth';

function PresenceHeartbeat() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return undefined;
    const sendHeartbeat = () => { void client.presence.heartbeat().catch(() => undefined); };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60_000);
    return () => window.clearInterval(interval);
  }, [user]);
  return null;
}

export function Layout() {
  const { user } = useAuth();
  return <><PresenceHeartbeat /><header><Link className="brand" to="/"><span className="brand-mark">UH</span><span>Underground <em>Heat</em> Studios</span></Link><nav aria-label="Main navigation">{user && <><NavLink to="/" end>Home</NavLink><NavLink to="/games">Games</NavLink><NavLink to="/my-player">My Player</NavLink><NavLink to="/clan">My Clan</NavLink><NavLink to="/leaderboards">Leaderboards</NavLink><NavLink className="profile-link" to="/profile">{user.display_name}</NavLink></>}</nav></header><Outlet /><footer><span>Underground Heat Studios</span><span>The private arcade · built for the crew</span></footer></>;
}
