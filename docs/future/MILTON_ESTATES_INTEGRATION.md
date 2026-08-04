# Future Milton Estates integration

Do not import, copy, move, or modify Milton Estates until this foundation is stable. First establish a regression baseline for its existing build, then preserve it as an independent application and give it a production route/origin in deployment. Update its catalog record only when a tested launch URL exists.

Adopt `game-client-sdk` only for platform identity and metadata calls; do not import catalog React internals. Keep existing LocalStorage saves untouched initially. Later, offer an explicit, recoverable migration to cloud saves rather than silently replacing local data.

Before and after integration, regression-test keyboard focus/input, audio unlock and volume, fullscreen, asset base paths, deep links/browser refresh, build output, existing save behavior, and catalog return navigation. Non-goal: rewriting Milton Estates to match the catalog style or adding cloud saves in the integration change.
