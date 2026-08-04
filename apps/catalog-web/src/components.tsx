import { Link } from 'react-router-dom';
import type { PlatformGame } from '@game-platform/game-client-sdk';

export function CapabilityTags({ game }: { game: PlatformGame }) {
  const capabilities = [game.supports_cloud_saves && 'Cloud saves', game.supports_leaderboards && 'Leaderboards', game.supports_multiplayer && 'Multiplayer'].filter((capability): capability is string => Boolean(capability));
  return capabilities.length ? <div className="tags">{capabilities.map((item) => <span key={item}>{item}</span>)}</div> : <div className="tags"><span>Solo play</span></div>;
}

export function GameArt({ game }: { game: PlatformGame }) {
  return game.cover_image_url ? <img className="game-art" src={game.cover_image_url} alt="" /> : <div className={`game-art fallback ${game.slug === 'milton-estates' ? 'estate' : ''}`} aria-hidden="true"><i /></div>;
}

export function GameCard({ game }: { game: PlatformGame }) {
  const playable = game.status === 'playable';
  return <article className="game-card"><GameArt game={game} /><div className="card-content"><div className="eyebrow"><span className={`status ${game.status}`}>{game.status.replace('_', ' ')}</span><span>{game.minimum_players}–{game.maximum_players} player{game.maximum_players !== 1 ? 's' : ''}</span></div><h3>{game.title}</h3><p>{game.short_description}</p><CapabilityTags game={game} /><div className="card-actions"><Link to={`/games/${game.slug}`}>Details</Link>{playable ? <a className="button" href={game.launch_url}>Play now</a> : <button disabled>Coming soon</button>}</div></div></article>;
}
