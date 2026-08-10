import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { client } from './api';
import { useAuth } from './auth';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

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

function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onInstallable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstallEvent(null); setOpen(false); setIsStandalone(true); };
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isStandalone || (!installEvent && !/iPad|iPhone|iPod/.test(navigator.userAgent))) return null;
  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      setInstallEvent(null);
    } else {
      setOpen(true);
    }
  };
  return <div className="install-prompt"><button className="install-button" type="button" onClick={() => void install()}>Add to home screen</button>{open && <div className="install-help" role="dialog" aria-label="Add to home screen instructions"><button className="install-close" type="button" aria-label="Close install instructions" onClick={() => setOpen(false)}>×</button><strong>Make it feel native</strong><p>Tap Share, then choose <b>Add to Home Screen</b>.</p></div>}</div>;
}

export function Layout() {
  const { user } = useAuth();
  return <><PresenceHeartbeat /><header><Link className="brand" to="/"><span className="brand-mark">UH</span><span>Underground <em>Heat</em> Studios</span></Link><nav aria-label="Main navigation">{user && <><NavLink to="/" end>Home</NavLink><NavLink to="/games">Games</NavLink><NavLink to="/my-player">My Player</NavLink><NavLink to="/clan">My Clan</NavLink><NavLink to="/leaderboards">Leaderboards</NavLink><NavLink className="profile-link" to="/profile">{user.display_name}</NavLink></>}</nav><InstallPrompt /></header><Outlet /><footer><span>Underground Heat Studios</span><span>The private arcade · built for the crew</span></footer></>;
}
