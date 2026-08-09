import { describe, expect, it } from 'vitest';
import { createGamePlatformClient } from '@bolb23/game-client-sdk';

describe('sample game SDK boundary', () => {
  it('can create the independent game client', () => {
    expect(createGamePlatformClient({ apiBaseUrl: 'http://localhost:8000/api/v1' }).games.getBySlug).toBeTypeOf('function');
  });
});
