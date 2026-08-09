import type { ThemeWeights, WorldPhaseConfig } from '../config/worldPhases';
import { DEFAULT_WORLD_PHASE_CONFIG, WorldPhase } from '../config/worldPhases';

export interface ThemeVisualBlend {
  sky: number;
  far: number;
  mid: number;
  near: number;
  ground: number;
}

function smoothStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function normalize(weights: ThemeWeights): ThemeWeights {
  const total = weights.city + weights.transition + weights.country;
  return { city: weights.city / total, transition: weights.transition / total, country: weights.country / total };
}

function blendWeights(from: ThemeWeights, to: ThemeWeights, progress: number): ThemeWeights {
  return normalize({
    city: from.city + (to.city - from.city) * progress,
    transition: from.transition + (to.transition - from.transition) * progress,
    country: from.country + (to.country - from.country) * progress,
  });
}

export class ThemeDirector {
  constructor(private readonly config: WorldPhaseConfig = DEFAULT_WORLD_PHASE_CONFIG) {}

  getPhase(distance: number): WorldPhase {
    if (distance < this.config.cityDistance) return WorldPhase.CITY;
    if (distance < this.config.cityDistance + this.config.transitionDistance) return WorldPhase.TRANSITION;
    return WorldPhase.COUNTRY;
  }

  getTransitionProgress(distance: number): number {
    return Math.max(0, Math.min(1, (distance - this.config.cityDistance) / this.config.transitionDistance));
  }

  getObstacleWeights(distance: number): ThemeWeights {
    const progress = this.getTransitionProgress(distance);
    if (progress === 0) return { city: 0.95, transition: 0.05, country: 0 };
    if (progress === 1) return { city: 0, transition: 0.07, country: 0.93 };
    const early: ThemeWeights = { city: 0.6, transition: 0.3, country: 0.1 };
    const late: ThemeWeights = { city: 0.15, transition: 0.3, country: 0.55 };
    return progress < 0.5
      ? blendWeights({ city: 0.95, transition: 0.05, country: 0 }, early, progress * 2)
      : blendWeights(early, late, (progress - 0.5) * 2);
  }

  getVisualBlend(distance: number): ThemeVisualBlend {
    const progress = this.getTransitionProgress(distance);
    return {
      sky: smoothStep((progress + 0.05) / 0.7),
      far: smoothStep((progress - 0.12) / 0.65),
      mid: smoothStep((progress - 0.27) / 0.62),
      near: smoothStep((progress - 0.45) / 0.5),
      ground: smoothStep((progress - 0.34) / 0.5),
    };
  }
}
