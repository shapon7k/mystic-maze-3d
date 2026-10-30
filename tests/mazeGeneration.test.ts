/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { MazeValidator } from '../src/game/MazeValidator';
import { DIFFICULTY_PRESETS, DifficultyLevel, MazeData } from '../src/types/game';

describe('MazeGenerator & MazeValidator (square grid)', () => {
  const difficulties: DifficultyLevel[] = ['novice', 'explorer', 'master'];

  difficulties.forEach((diff) => {
    it(`generates 200 valid, fully connected square mazes for difficulty: ${diff}`, () => {
      const config = DIFFICULTY_PRESETS[diff];

      for (let i = 0; i < 200; i++) {
        const seed = Math.floor(Math.random() * 1000000) + i;
        const maze = MazeGenerator.generate(config, seed);
        const result = MazeValidator.validate(maze);

        expect(result.isValid, `Seed ${seed} failed validation: ${result.errors.join(', ')}`).toBe(true);
        expect(result.reachableCellCount).toBe(config.rows * config.cols);
        expect(maze.startCoord.row === maze.endCoord.row && maze.startCoord.col === maze.endCoord.col).toBe(false);
        expect(result.startToEndDistance).toBeGreaterThan(0);
        expect(maze.shortestPathLength).toBe(result.startToEndDistance);
        expect(result.intersectionCount).toBeGreaterThanOrEqual(4);
        expect(result.deadEndCount).toBeGreaterThanOrEqual(4);

        // The outer boundary is always sealed
        for (let c = 0; c < config.cols; c++) {
          expect(maze.cells[0][c].openN).toBe(false);
          expect(maze.cells[config.rows - 1][c].openS).toBe(false);
        }
        for (let r = 0; r < config.rows; r++) {
          expect(maze.cells[r][0].openW).toBe(false);
          expect(maze.cells[r][config.cols - 1].openE).toBe(false);
        }
      }
    });
  });

  it('generates the exact same maze given the exact same seed', () => {
    const config = DIFFICULTY_PRESETS.explorer;
    for (const seed of [42, 99999, 123456, 789012, 314159]) {
      const mazeA = MazeGenerator.generate(config, seed);
      const mazeB = MazeGenerator.generate(config, seed);

      expect(mazeA.seed).toBe(mazeB.seed);
      expect(mazeA.startCoord).toEqual(mazeB.startCoord);
      expect(mazeA.endCoord).toEqual(mazeB.endCoord);
      expect(mazeA.shortestPathLength).toBe(mazeB.shortestPathLength);
      expect(mazeA.startWorldPos).toEqual(mazeB.startWorldPos);
      expect(mazeA.endWorldPos).toEqual(mazeB.endWorldPos);
      expect(mazeA.startYaw).toBe(mazeB.startYaw);
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          expect(mazeA.cells[r][c]).toEqual(mazeB.cells[r][c]);
        }
      }
    }
  });

  it('generates different maze topologies for different seeds', () => {
    const config = DIFFICULTY_PRESETS.explorer;
    const maze1 = MazeGenerator.generate(config, 10001);
    const maze2 = MazeGenerator.generate(config, 20002);
    const maze3 = MazeGenerator.generate(config, 30003);

    const hasDifference = (a: MazeData, b: MazeData) => {
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          const cA = a.cells[r][c];
          const cB = b.cells[r][c];
          if (cA.openN !== cB.openN || cA.openE !== cB.openE || cA.openS !== cB.openS || cA.openW !== cB.openW) {
            return true;
          }
        }
      }
      return false;
    };

    expect(hasDifference(maze1, maze2)).toBe(true);
    expect(hasDifference(maze2, maze3)).toBe(true);
    expect(hasDifference(maze1, maze3)).toBe(true);
  });

  it('starts the player facing an open passage, never a wall', () => {
    for (const diff of difficulties) {
      for (let seed = 0; seed < 50; seed++) {
        const maze = MazeGenerator.generate(DIFFICULTY_PRESETS[diff], seed);
        const fx = -Math.sin(maze.startYaw);
        const fz = -Math.cos(maze.startYaw);
        const cell = maze.cells[maze.startCoord.row][maze.startCoord.col];
        const open =
          (Math.abs(fz + 1) < 1e-6 && cell.openN) ||
          (Math.abs(fz - 1) < 1e-6 && cell.openS) ||
          (Math.abs(fx - 1) < 1e-6 && cell.openE) ||
          (Math.abs(fx + 1) < 1e-6 && cell.openW);
        expect(open, `${diff} seed ${seed}: start faces a wall`).toBe(true);
      }
    }
  });
});
