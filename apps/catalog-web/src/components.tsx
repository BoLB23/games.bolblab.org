import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ClanRole, PlatformGame, PlayerAppearanceResponse } from '@bolb23/game-client-sdk';

export const HAIRCUT_OPTIONS = [
  { key: 'short', label: 'Short' },
  { key: 'fade', label: 'Fade' },
  { key: 'long', label: 'Long' },
  { key: 'mohawk', label: 'Mohawk' },
] as const;

export const PLAYER_PALETTES = {
  hair_color: ['#2b1d13', '#5a3521', '#bd742c', '#efe0b6'],
  tshirt_color: ['#f05a28', '#ffbd3f', '#3c7468', '#ddd2bd'],
  pants_color: ['#1b2330', '#2f4c43', '#6c4931', '#3a3430'],
  shoe_color: ['#f5efe4', '#f05a28', '#27231f', '#ffbd3f'],
} as const;

type AvatarSize = 'small' | 'medium' | 'large';

export function PlayerAvatar({ appearance, size = 'medium', label }: { appearance: PlayerAppearanceResponse; size?: AvatarSize; label?: string }) {
  const style = {
    '--avatar-hair': appearance.hair_color,
    '--avatar-shirt': appearance.tshirt_color,
    '--avatar-pants': appearance.pants_color,
    '--avatar-shoes': appearance.shoe_color,
  } as CSSProperties;
  return <span className={`player-avatar player-avatar-${size} haircut-${appearance.haircut}`} style={style} role={label ? 'img' : undefined} aria-label={label}>{label ? null : <span className="sr-only">{appearance.nickname}</span>}<span className="avatar-hair" /><span className="avatar-head"><span className="avatar-eye avatar-eye-left" /><span className="avatar-eye avatar-eye-right" /></span><span className="avatar-shirt" /><span className="avatar-pants" /><span className="avatar-shoe avatar-shoe-left" /><span className="avatar-shoe avatar-shoe-right" /></span>;
}

export function RoleBadge({ role }: { role: ClanRole }) {
  return <span className={`role-badge role-${role}`}>{role}</span>;
}

export function CapabilityTags({ game }: { game: PlatformGame }) {
  const capabilities = [game.supports_cloud_saves && 'Cloud saves', game.supports_leaderboards && 'Leaderboards', game.supports_multiplayer && 'Multiplayer'].filter((capability): capability is string => Boolean(capability));
  return capabilities.length ? <div className="tags">{capabilities.map((item) => <span key={item}>{item}</span>)}</div> : <div className="tags"><span>Solo play</span></div>;
}

export function GameArt({ game }: { game: PlatformGame }) {
  return game.cover_image_url ? <img className="game-art" src={game.cover_image_url} alt="" /> : <div className={`game-art fallback ${game.slug === 'milton-estates' ? 'estate' : ''}`} aria-hidden="true"><i /></div>;
}

export function GameCard({ game }: { game: PlatformGame }) {
  const playable = game.status === 'playable';
  return <article className="game-card"><GameArt game={game} /><div className="card-content"><div className="eyebrow"><span className={`status ${game.status}`}>{game.status.replace('_', ' ')}</span><span>{game.minimum_players}–{game.maximum_players} player{game.maximum_players !== 1 ? 's' : ''}</span></div><h3>{game.title}</h3><p>{game.short_description}</p><CapabilityTags game={game} /><div className="card-actions"><Link to={`/games/${game.slug}`}>Details</Link>{playable ? <a className="button" href={game.launch_url} target="_blank" rel="noopener noreferrer">Play now</a> : <button disabled>Coming soon</button>}</div></div></article>;
}
