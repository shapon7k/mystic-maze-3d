/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DifficultyLevel, GridCoord, MazeCell, MazeData, getOpenNeighbors } from '../types/game';

export interface ValidationCriteria {
  minStartEndDistance: number;
  minIntersections: number;
  minDeadEnds: number;
}

export const DIFFICULTY_VALIDATION_CRITERIA: Record<DifficultyLevel, ValidationCriteria> = {
  novice: { minStartEndDistance: 12, minIntersections: 5, minDeadEnds: 4 },
  explorer: { minStartEndDistance: 18, minIntersections: 10, minDeadEnds: 8 },
  master: { minStartEndDistance: 26, minIntersections: 16, minDeadEnds: 12 },
};

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  reachableCellCount: number;
  totalCellCount: number;
  startToEndDistance: number;
  intersectionCount: number;
  deadEndCount: number;
}

export class MazeValidator {
  /**
   * Validates structural integrity, solvability, branch complexity and wall symmetry.
   * This module stays strictly internal and never exposes the solution path to the player.
   */
  public static validate(maze: MazeData): ValidationResult {
    const { rows, cols, cells, startCoord, endCoord, difficulty } = maze;
    const errors: string[] = [];
    const totalCellCount = rows * cols;
    const criteria = DIFFICULTY_VALIDATION_CRITERIA[difficulty] || DIFFICULTY_VALIDATION_CRITERIA.novice;

    // 1. Wall symmetry and outer boundary must be sealed
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (r === 0 && cell.openN) errors.push(`Cell (${r},${c}) opens through the north outer wall`);
        if (r === rows - 1 && cell.openS) errors.push(`Cell (${r},${c}) opens through the south outer wall`);
        if (c === 0 && cell.openW) errors.push(`Cell (${r},${c}) opens through the west outer wall`);
        if (c === cols - 1 && cell.openE) errors.push(`Cell (${r},${c}) opens through the east outer wall`);
        if (c < cols - 1 && cell.openE !== cells[r][c + 1].openW) {
          errors.push(`Wall symmetry mismatch between (${r},${c}) East and (${r},${c + 1}) West`);
        }
        if (r < rows - 1 && cell.openS !== cells[r + 1][c].openN) {
          errors.push(`Wall symmetry mismatch between (${r},${c}) South and (${r + 1},${c}) North`);
        }
      }
    }

    // 2. Intersections (>= 3 openings) and dead ends (== 1 opening)
    let intersectionCount = 0;
    let deadEndCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const openings = this.countOpenings(cells[r][c]);
        if (openings >= 3) intersectionCount++;
        else if (openings === 1) deadEndCount++;
        else if (openings === 0) errors.push(`Isolated cell detected at (${r},${c}) with 0 openings`);
      }
    }
    if (intersectionCount < criteria.minIntersections) {
      errors.push(`Insufficient intersections: found ${intersectionCount}, required at least ${criteria.minIntersections}`);
    }
    if (deadEndCount < criteria.minDeadEnds) {
      errors.push(`Insufficient dead ends: found ${deadEndCount}, required at least ${criteria.minDeadEnds}`);
    }

    // 3. Connectivity and Start-to-End distance via BFS
    const distances: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const queue: GridCoord[] = [startCoord];
    distances[startCoord.row][startCoord.col] = 0;
    let reachableCellCount = 0;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      reachableCellCount++;
      const d = distances[cur.row][cur.col];
      for (const n of getOpenNeighbors(maze, cur.row, cur.col)) {
        if (distances[n.row][n.col] === -1) {
          distances[n.row][n.col] = d + 1;
          queue.push(n);
        }
      }
    }

    if (reachableCellCount !== totalCellCount) {
      errors.push(`Maze is not fully connected: only ${reachableCellCount}/${totalCellCount} cells are reachable from Start`);
    }
    if (startCoord.row === endCoord.row && startCoord.col === endCoord.col) {
      errors.push(`Start and End occupy the exact same cell (${startCoord.row},${startCoord.col})`);
    }

    const startToEndDistance = distances[endCoord.row][endCoord.col];
    if (startToEndDistance === -1) {
      errors.push('No valid route exists between Start and End');
    } else if (startToEndDistance < criteria.minStartEndDistance) {
      errors.push(
        `Route distance from Start to End (${startToEndDistance}) is below minimum threshold (${criteria.minStartEndDistance})`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      reachableCellCount,
      totalCellCount,
      startToEndDistance,
      intersectionCount,
      deadEndCount,
    };
  }

  private static countOpenings(cell: MazeCell): number {
    return (cell.openN ? 1 : 0) + (cell.openE ? 1 : 0) + (cell.openS ? 1 : 0) + (cell.openW ? 1 : 0);
  }
}
