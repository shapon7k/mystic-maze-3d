/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { CollisionSystem } from '../src/game/CollisionSystem';
import { DIFFICULTY_PRESETS, DifficultyLevel } from '../src/types/game';

/** Distance from a point to an axis-aligned rectangle (0 if inside). */
function distanceToRect(x: number, z: number, r: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const cx = Math.max(r.minX, Math.min(x, r.maxX));
  const cz = Math.max(r.minZ, Math.min(z, r.maxZ));
  return Math.hypot(x - cx, z - cz);
}

describe('CollisionSystem (square walls) corner / junction movement simulation', () => {
  const difficulties: DifficultyLevel[] = ['novice', 'explorer', 'master'];

  difficulties.forEach((diff) => {
    it(`player never penetrates walls or leaves the maze when sprinting in random directions: ${diff}`, () => {
      const config = DIFFICULTY_PRESETS[diff];
      let seedState = 12345;
      const rand = () => {
        seedState = (seedState * 1664525 + 1013904223) >>> 0;
        return seedState / 4294967296;
      };

      for (let seed = 0; seed < 20; seed++) {
        const maze = MazeGenerator.generate(config, seed);
        const collision = new CollisionSystem(maze);
        const halfW = (maze.cols * maze.cellSize) / 2;
        const halfD = (maze.rows * maze.cellSize) / 2;

        for (let trial = 0; trial < 20; trial++) {
          const row = Math.floor(rand() * maze.rows);
          const col = Math.floor(rand() * maze.cols);
          const start = MazeGenerator.cellToWorld(maze, row, col);
          let x = start.x;
          let z = start.z;
          let angle = rand() * Math.PI * 2;

          for (let step = 0; step < 400; step++) {
            if (step % 20 === 0) angle = rand() * Math.PI * 2;
            const res = collision.resolvePosition(x + Math.cos(angle) * 0.12, z + Math.sin(angle) * 0.12);
            x = res.x;
            z = res.z;

            expect(Math.abs(x)).toBeLessThanOrEqual(halfW);
            expect(Math.abs(z)).toBeLessThanOrEqual(halfD);
            for (const wall of collision.wallSegments) {
              expect(distanceToRect(x, z, wall)).toBeGreaterThanOrEqual(collision.playerRadius - 1e-3);
            }
          }
        }
      }
    });
  });

  it('hard bounds clamp prevents teleporting outside the maze', () => {
    const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 7);
    const collision = new CollisionSystem(maze);
    const limit = (maze.cols * maze.cellSize) / 2 - 0.225 - collision.playerRadius;

    for (const [x, z] of [[1000, 0], [-1000, 0], [0, 1000], [0, -1000], [500, 500]]) {
      const res = collision.resolvePosition(x, z);
      expect(Math.abs(res.x)).toBeLessThanOrEqual(limit + 1e-6);
      expect(Math.abs(res.z)).toBeLessThanOrEqual(limit + 1e-6);
      expect(res.collided).toBe(true);
    }
  });

  it('pushes a player that is placed inside a wall out to a clear position', () => {
    const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 3);
    const collision = new CollisionSystem(maze);

    for (const wall of collision.wallSegments) {
      const cx = (wall.minX + wall.maxX) / 2;
      const cz = (wall.minZ + wall.maxZ) / 2;
      const res = collision.resolvePosition(cx, cz);
      expect(distanceToRect(res.x, res.z, wall)).toBeGreaterThanOrEqual(collision.playerRadius - 1e-3);
    }
  });
});
