# FlappyMike

FlappyMike is an independent Phaser 4.2.1/Vite game that connects to the platform only through `@bolb23/game-client-sdk`. It launches on port 6185 locally and is served at `/games/flappy-mike/` by the production web image.

Controls: click/tap or press Space to flap. The first flap starts the run. A run uses a fixed 960×540 logical world and Arcade Physics; the player stays at 28% of the screen while obstacles and parallax scenery travel left.

## Tuning

All initial gameplay values live in [`src/config/gameplay.ts`](src/config/gameplay.ts). In a Vite development build, press F2 to open the hidden tuning panel. Arrow keys select/adjust values live; H toggles hitboxes, G toggles god mode, P pauses, R resets values, and C downloads the current configuration as JSON. The panel is not available in a production build.

The city is configured for roughly one minute at the opening speed, followed by a roughly 40-second staggered visual transition to the countryside. `ThemeDirector` determines both parallax blending and the weighted city/transition/country obstacle selection from distance, never from a timer.

## Art pipeline and final assets

The production pass loads a generated FlappyMike atlas plus tileable illustrated SVG environment, obstacle, decoration, effect, and logo assets. Permanent keys and paths live in [`src/assets/assetManifest.ts`](src/assets/assetManifest.ts); `src/assets/placeholders.ts` remains as a load-failure fallback.

Run `npm run art:fallbacks --workspace @game-platform/flappy-mike` to rebuild deterministic environment/UI SVGs. Run `npm run art:atlas --workspace @game-platform/flappy-mike` to chroma-key, normalize, and repack the 128×128 player frames (requires `uv`; Pillow is resolved ephemerally). Source poses and working frames live under `assets/flappymike/`; only runtime files live under `public/assets/flappymike/`. Full prompts, palette, dimensions, negative constraints, and QA notes are in [`docs/FLAPPYMIKE_ART_PROMPTS.md`](docs/FLAPPYMIKE_ART_PROMPTS.md).

In development, add `?artDistance=17800` (or another world distance) to preview transition art without changing normal gameplay progression. This preview is disabled in production builds.

The platform persists a local best immediately. When launched while authenticated through the catalog, it additionally starts a normal game session and submits a new personal best to the server-owned `distance` leaderboard.

`AudioDirector` supplies restrained synthesized flap, impact, and restart feedback for the graybox. It is intentionally the one replacement point for authored Phaser sound assets; looping music and environmental ambience remain optional until the final audio pass.
