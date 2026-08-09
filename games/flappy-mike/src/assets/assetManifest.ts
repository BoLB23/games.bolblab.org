const ROOT = 'assets/flappymike';

export const ASSET_KEYS = {
  player: 'flappy-mike/player',
  playerAtlas: 'flappymike_atlas',
  logo: 'logo_flappymike',
  cityObstacle: 'flappy-mike/obstacle-city',
  transitionObstacle: 'flappy-mike/obstacle-transition',
  countryObstacle: 'flappy-mike/obstacle-country',
  skyCity: 'city_sky',
  skyCountry: 'country_sky',
  farCity: 'city_far_skyline',
  farTransition: 'transition_low_buildings',
  farCountry: 'country_far_hills',
  midCity: 'city_mid_rowhomes',
  midTransition: 'transition_open_land',
  midCountry: 'country_fields',
  nearCity: 'city_near_rooftops',
  nearTransition: 'transition_tree_line',
  nearCountry: 'country_near_fence',
  groundCity: 'city_ground',
  groundTransition: 'transition_ground',
  groundCountry: 'country_ground',
  decorCityWaterTower: 'decor_city_water_tower',
  decorHighwaySign: 'landmark_highway_sign',
  decorCountryCow: 'decor_country_cow_blackwhite',
  decorCountryBuggy: 'decor_country_buggy',
  fxFlapPuff: 'fx_flap_puff',
  fxFeather01: 'fx_feather_01',
  fxFeather02: 'fx_feather_02',
  fxImpactStar: 'fx_impact_star',
} as const;

export const ANIMATION_KEYS = {
  idle: 'flappymike-idle',
  flap: 'flappymike-flap',
  glide: 'flappymike-glide',
  fall: 'flappymike-fall',
  hit: 'flappymike-hit',
  dead: 'flappymike-dead',
} as const;

export const OBSTACLE_KEYS = {
  city: ['obstacle_city_rowhome', 'obstacle_city_rooftop', 'obstacle_city_utility'],
  transition: ['obstacle_transition_warehouse', 'obstacle_transition_tree_utility', 'obstacle_transition_roadside'],
  country: ['obstacle_country_barn', 'obstacle_country_silo_hay', 'obstacle_country_corn_fence'],
} as const;

export const ATLAS_PATHS = {
  texture: `${ROOT}/player/atlas/flappymike.png`,
  data: `${ROOT}/player/atlas/flappymike.json`,
} as const;

export const IMAGE_PATHS: ReadonlyArray<readonly [string, string]> = [
  [ASSET_KEYS.logo, `${ROOT}/ui/logo_flappymike.svg`],
  [ASSET_KEYS.skyCity, `${ROOT}/backgrounds/city/city_sky.svg`],
  [ASSET_KEYS.skyCountry, `${ROOT}/backgrounds/country/country_sky.svg`],
  [ASSET_KEYS.farCity, `${ROOT}/backgrounds/city/city_far_skyline.svg`],
  [ASSET_KEYS.farTransition, `${ROOT}/backgrounds/transition/transition_low_buildings.svg`],
  [ASSET_KEYS.farCountry, `${ROOT}/backgrounds/country/country_far_hills.svg`],
  [ASSET_KEYS.midCity, `${ROOT}/backgrounds/city/city_mid_rowhomes.svg`],
  [ASSET_KEYS.midTransition, `${ROOT}/backgrounds/transition/transition_open_land.svg`],
  [ASSET_KEYS.midCountry, `${ROOT}/backgrounds/country/country_fields.svg`],
  [ASSET_KEYS.nearCity, `${ROOT}/backgrounds/city/city_near_rooftops.svg`],
  [ASSET_KEYS.nearTransition, `${ROOT}/backgrounds/transition/transition_tree_line.svg`],
  [ASSET_KEYS.nearCountry, `${ROOT}/backgrounds/country/country_near_fence.svg`],
  [ASSET_KEYS.groundCity, `${ROOT}/backgrounds/city/city_ground.svg`],
  [ASSET_KEYS.groundTransition, `${ROOT}/backgrounds/transition/transition_ground.svg`],
  [ASSET_KEYS.groundCountry, `${ROOT}/backgrounds/country/country_ground.svg`],
  [ASSET_KEYS.decorCityWaterTower, `${ROOT}/decorations/city/decor_city_water_tower.svg`],
  [ASSET_KEYS.decorHighwaySign, `${ROOT}/decorations/transition/landmark_highway_sign.svg`],
  [ASSET_KEYS.decorCountryCow, `${ROOT}/decorations/country/decor_country_cow_blackwhite.svg`],
  [ASSET_KEYS.decorCountryBuggy, `${ROOT}/decorations/country/decor_country_buggy.svg`],
  [ASSET_KEYS.fxFlapPuff, `${ROOT}/effects/fx_flap_puff.svg`],
  [ASSET_KEYS.fxFeather01, `${ROOT}/effects/fx_feather_01.svg`],
  [ASSET_KEYS.fxFeather02, `${ROOT}/effects/fx_feather_02.svg`],
  [ASSET_KEYS.fxImpactStar, `${ROOT}/effects/fx_impact_star.svg`],
  ...OBSTACLE_KEYS.city.map((key) => [key, `${ROOT}/obstacles/city/${key}.svg`] as const),
  ...OBSTACLE_KEYS.transition.map((key) => [key, `${ROOT}/obstacles/transition/${key}.svg`] as const),
  ...OBSTACLE_KEYS.country.map((key) => [key, `${ROOT}/obstacles/country/${key}.svg`] as const),
];
