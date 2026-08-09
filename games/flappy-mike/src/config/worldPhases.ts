export enum WorldPhase {
  CITY = 'CITY',
  TRANSITION = 'TRANSITION',
  COUNTRY = 'COUNTRY',
}

export interface WorldPhaseConfig {
  cityDistance: number;
  transitionDistance: number;
}

// At the starting speed, cityDistance is about one minute; the transition lasts about 40 seconds.
export const DEFAULT_WORLD_PHASE_CONFIG: Readonly<WorldPhaseConfig> = Object.freeze({
  cityDistance: 13_200,
  transitionDistance: 9_200,
});

export interface ThemeWeights {
  city: number;
  transition: number;
  country: number;
}
