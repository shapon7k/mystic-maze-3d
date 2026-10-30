/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DifficultyConfig, GridCoord, MazeCell, MazeData, cellCenterToWorld } from '../types/game';
import { MazeValidator } from './MazeValidator';

// Seeded pseudo-random number generator (Mulberry32)
export function createRNG(seed: number) {
  let s = Math.floor(seed) >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Dir = 'N' | 'E' | 'S' | 'W';
const DIRS: { dir: Dir; dRow: number; dCol: number; opposite: Dir }[] = [
  { dir: 'N', dRow: -1, dCol: 0, opposite: 'S' },
  { dir: 'E', dRow: 0, dCol: 1, opposite: 'W' },
  { dir: 'S', dRow: 1, dCol: 0, opposite: 'N' },
  { dir: 'W', dRow: 0, dCol: -1, opposite: 'E' },
];

function setOpen(cell: MazeCell, dir: Dir, value: boolean) {
  if (dir === 'N') cell.openN = value;
  else if (dir === 'E') cell.openE = value;
  else if (dir === 'S') cell.openS = value;
  else cell.openW = value;
}

export class MazeGenerator {
  /**
   * Generates and validates a procedural square labyrinth with a guaranteed valid route.
   * If validation fails, deterministically retries with a new seed up to a retry limit.
   */
  public static generate(config: DifficultyConfig, seed?: number): MazeData {
    const initialSeed = seed !== undefined ? seed : Math.floor(Math.random() * 1000000);
    const maxRetries = 10;
    let bestCandidate: MazeData | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Deterministic seed progression keeps reproducible runs consistent
      const candidateSeed = attempt === 0 ? initialSeed : ((initialSeed + attempt * 7919) >>> 0);
      const candidate = this.generateCandidate(config, candidateSeed);
      if (MazeValidator.validate(candidate).isValid) {
        return candidate;
      }
      bestCandidate = candidate;
    }
    return bestCandidate!;
  }

  /**
   * Raw candidate: randomized depth-first search with backtracking (perfect maze),
   * followed by light braiding that opens a few extra passages to create loops.
   */
  private static generateCandidate(config: DifficultyConfig, finalSeed: number): MazeData {
    const rng = createRNG(finalSeed);
    const { rows, cols, cellSize, wallHeight } = config;

    const cells: MazeCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const line: MazeCell[] = [];
      for (let c = 0; c < cols; c++) {
        line.push({ row: r, col: c, openN: false, openE: false, openS: false, openW: false });
      }
      cells.push(line);
    }

    // Start cell: random cell on the bottom (south) border
    const startCoord: GridCoord = { row: rows - 1, col: Math.floor(rng() * cols) };

    // Iterative randomized DFS (recursive backtracker)
    const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack: GridCoord[] = [startCoord];
    visited[startCoord.row][startCoord.col] = true;

    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const options = DIRS.filter((d) => {
        const nr = cur.row + d.dRow;
        const nc = cur.col + d.dCol;
        return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc];
      });

      if (options.length === 0) {
        stack.pop();
        continue;
      }

      const pick = options[Math.floor(rng() * options.length)];
      const nr = cur.row + pick.dRow;
      const nc = cur.col + pick.dCol;
      setOpen(cells[cur.row][cur.col], pick.dir, true);
      setOpen(cells[nr][nc], pick.opposite, true);
      visited[nr][nc] = true;
      stack.push({ row: nr, col: nc });
    }

    // Braiding: open ~8% of the remaining interior walls to create loops and alternative routes
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (c < cols - 1 && !cell.openE && rng() < 0.08) {
          cell.openE = true;
          cells[r][c + 1].openW = true;
        }
        if (r < rows - 1 && !cell.openS && rng() < 0.08) {
          cell.openS = true;
          cells[r + 1][c].openN = true;
        }
      }
    }

    // End cell: the cell with the longest shortest-path distance from the start
    const { distances, farthest } = this.calculateDistances(cells, startCoord, rows, cols);
    const endCoord = farthest;
    const shortestPathLength = distances[endCoord.row][endCoord.col];

    const startWorldPos = cellCenterToWorld(startCoord.row, startCoord.col, rows, cols, cellSize);
    const endWorldPos = cellCenterToWorld(endCoord.row, endCoord.col, rows, cols, cellSize);

    // Face an open passage at the start (prefer north, i.e. into the maze)
    const sc = cells[startCoord.row][startCoord.col];
    let fx = 0;
    let fz = -1;
    if (sc.openN) { fx = 0; fz = -1; }
    else if (sc.openE) { fx = 1; fz = 0; }
    else if (sc.openW) { fx = -1; fz = 0; }
    else if (sc.openS) { fx = 0; fz = 1; }
    // Player forward vector is (-sin(yaw), -cos(yaw))
    const startYaw = Math.atan2(-fx, -fz);

    return {
      seed: finalSeed,
      difficulty: config.id,
      rows,
      cols,
      cellSize,
      wallHeight,
      cells,
      startCoord,
      endCoord,
      startWorldPos,
      endWorldPos,
      startYaw,
      shortestPathLength,
    };
  }

  /** World-space center of the cell (row, col) of the given maze. */
  public static cellToWorld(maze: Pick<MazeData, 'rows' | 'cols' | 'cellSize'>, row: number, col: number) {
    return cellCenterToWorld(row, col, maze.rows, maze.cols, maze.cellSize);
  }

  /** BFS distance map from the start cell (used internally only, never exposed to the player). */
  private static calculateDistances(cells: MazeCell[][], start: GridCoord, rows: number, cols: number) {
    const distances: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const queue: GridCoord[] = [start];
    distances[start.row][start.col] = 0;
    let farthest: GridCoord = start;
    let head = 0;

    while (head < queue.length) {
      const cur = queue[head++];
      const d = distances[cur.row][cur.col];
      if (d > distances[farthest.row][farthest.col]) farthest = cur;
      const cell = cells[cur.row][cur.col];
      const next: GridCoord[] = [];
      if (cell.openN && cur.row > 0) next.push({ row: cur.row - 1, col: cur.col });
      if (cell.openS && cur.row < rows - 1) next.push({ row: cur.row + 1, col: cur.col });
      if (cell.openW && cur.col > 0) next.push({ row: cur.row, col: cur.col - 1 });
      if (cell.openE && cur.col < cols - 1) next.push({ row: cur.row, col: cur.col + 1 });
      for (const n of next) {
        if (distances[n.row][n.col] === -1) {
          distances[n.row][n.col] = d + 1;
          queue.push(n);
        }
      }
    }
    return { distances, farthest };
  }
}
