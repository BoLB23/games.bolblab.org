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

interface ObstacleWeightKeyframe {
  progress: number;
  weights: ThemeWeights;
}

const OBSTACLE_WEIGHT_KEYFRAMES: readonly ObstacleWeightKeyframe[] = [
  // Keep the opening unmistakably urban, then let the roadside / industrial
  // family lead before farm obstacles take over.
  { progress: 0, weights: { city: 0.95, transition: 0.05, country: 0 } },
  { progress: 0.18, weights: { city: 0.78, transition: 0.2, country: 0.02 } },
  { progress: 0.42, weights: { city: 0.54, transition: 0.37, country: 0.09 } },
  { progress: 0.62, weights: { city: 0.25, transition: 0.46, country: 0.29 } },
  { progress: 0.8, weights: { city: 0.06, transition: 0.34, country: 0.6 } },
  { progress: 1, weights: { city: 0, transition: 0.07, country: 0.93 } },
] as const;

function keyframedWeights(progress: number): ThemeWeights {
  const clamped = Math.max(0, Math.min(1, progress));
  const nextIndex = OBSTACLE_WEIGHT_KEYFRAMES.findIndex((keyframe) => keyframe.progress >= clamped);
  if (nextIndex <= 0) return OBSTACLE_WEIGHT_KEYFRAMES[0].weights;
  if (nextIndex === -1) return OBSTACLE_WEIGHT_KEYFRAMES[OBSTACLE_WEIGHT_KEYFRAMES.length - 1].weights;
  const previous = OBSTACLE_WEIGHT_KEYFRAMES[nextIndex - 1];
  const next = OBSTACLE_WEIGHT_KEYFRAMES[nextIndex];
  return blendWeights(previous.weights, next.weights, smoothStep((clamped - previous.progress) / (next.progress - previous.progress)));
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
    return keyframedWeights(this.getTransitionProgress(distance));
  }

  getVisualBlend(distance: number): ThemeVisualBlend {
    const progress = this.getTransitionProgress(distance);
    return {
      // Do not dissolve the entire world at once. The atmosphere changes first,
      // followed by the distant skyline, then the rowhomes / open land, with
      // nearby roofs and the ground holding their city identity longest.
      sky: smoothStep((progress - 0.02) / 0.7),
      far: smoothStep((progress - 0.1) / 0.74),
      mid: smoothStep((progress - 0.18) / 0.72),
      near: smoothStep((progress - 0.34) / 0.64),
      ground: smoothStep((progress - 0.46) / 0.54),
    };
  }
}
