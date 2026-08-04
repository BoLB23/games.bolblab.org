import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const databasePath = 'data/game-platform.db';
if (existsSync(databasePath)) rmSync(databasePath);
for (const command of [['npm', ['run', 'db:migrate']], ['npm', ['run', 'db:seed']]]) {
  const [executable, args] = command;
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
