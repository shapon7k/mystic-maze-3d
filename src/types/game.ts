/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameState = 'TITLE' | 'PLAYING' | 'PAUSED' | 'VICTORY';

export type DifficultyLevel = 'novice' | 'explorer' | 'master';

export interface DifficultyConfig {
  id: DifficultyLevel;
  name: string;
  rows: number;       // number of cells along the Z axis
  cols: number;       // number of cells along the X axis
  cellSize: number;   // width of one square cell in meters
  wallHeight: number;
  description: string;
}

export const DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyConfig> = {
  novice: {
    id: 'novice',
    name: 'Initiate',
    rows: 8,
    cols: 8,
    cellSize: 5.0,
    wallHeight: 4.5,
    description: '8 × 8 Square Grid · 64 Chambers · Gentle Exploration',
  },
  explorer: {
    id: 'explorer',
    name: 'Seeker',
    rows: 11,
    cols: 11,
    cellSize: 5.0,
    wallHeight: 4.8,
    description: '11 × 11 Square Grid · 121 Chambers · Winding Corridors',
  },
  master: {
    id: 'master',
    name: 'Archon',
    rows: 14,
    cols: 14,
    cellSize: 5.0,
    wallHeight: 5.0,
    description: '14 × 14 Square Grid · 196 Chambers · The True Labyrinth',
  },
};

/**
 * One square cell of the labyrinth.
 * Grid convention (world space, y is up):
 *   row increases toward +Z  (South),  row - 1 is North (-Z)
 *   col increases toward +X  (East),   col - 1 is West  (-X)
 */
export interface MazeCell {
  row: number;
  col: number;
  openN: boolean; // passage toward row - 1
  openE: boolean; // passage toward col + 1
  openS: boolean; // passage toward row + 1
  openW: boolean; // passage toward col - 1
}

export interface GridCoord {
  row: number;
  col: number;
}

export interface MazeData {
  seed: number;
  difficulty: DifficultyLevel;
  rows: number;
  cols: number;
  cellSize: number;
  wallHeight: number;
  cells: MazeCell[][];
  startCoord: GridCoord;
  endCoord: GridCoord;
  startWorldPos: { x: number; z: number };
  endWorldPos: { x: number; z: number };
  /** Player yaw at the start so the player faces an open passage (not a wall) */
  startYaw: number;
  shortestPathLength: number;
}

/** World-space center of a grid cell. The maze is centered on the world origin. */
export function cellCenterToWorld(
  row: number,
  col: number,
  rows: number,
  cols: number,
  cellSize: number
): { x: number; z: number } {
  return {
    x: (col + 0.5 - cols / 2) * cellSize,
    z: (row + 0.5 - rows / 2) * cellSize,
  };
}

/** Neighbouring cells reachable through open passages (no wrap-around). */
export function getOpenNeighbors(maze: Pick<MazeData, 'rows' | 'cols' | 'cells'>, row: number, col: number): GridCoord[] {
  const cell = maze.cells[row][col];
  const out: GridCoord[] = [];
  if (cell.openN && row > 0) out.push({ row: row - 1, col });
  if (cell.openS && row < maze.rows - 1) out.push({ row: row + 1, col });
  if (cell.openW && col > 0) out.push({ row, col: col - 1 });
  if (cell.openE && col < maze.cols - 1) out.push({ row, col: col + 1 });
  return out;
}

export interface GameSettings {
  lookSensitivity: number;  // 0.5 to 2.5
  soundVolume: number;      // 0 to 1
  musicVolume: number;      // 0 to 1
  quality: 'low' | 'medium' | 'high';
  isMuted: boolean;
  invertY: boolean;
  cameraMode: 'first-person' | 'third-person';
  /** Index (0-2) of the bundled character skin used by the player. */
  characterSkin: number;
}

export interface RunStatistics {
  elapsedTimeMs: number;
  stepsTaken: number;
  distanceTraveledMeters: number;
  difficulty: DifficultyLevel;
  seed: number;
  completedAt: Date;
}
