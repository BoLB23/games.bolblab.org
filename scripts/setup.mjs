import { existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example. Update SESSION_SECRET before sharing this environment.');
}

const result = spawnSync('uv', ['sync'], { cwd: 'apps/api', stdio: 'inherit' });
if (result.error) {
  console.error('uv is required. Install it from https://docs.astral.sh/uv/ and rerun npm run setup.');
  process.exit(1);
}
process.exit(result.status ?? 1);
