/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { MazeData } from '../types/game';

/**
 * One straight, axis-aligned wall run of the square labyrinth.
 * The wall is a solid box occupying exactly [minX,maxX] x [minZ,maxZ] on the ground plane
 * and [0,height] vertically. Collision and rendering both use this exact rectangle.
 */
export interface WallSegment {
  id: string;
  orientation: 'horizontal' | 'vertical'; // horizontal: runs along X, vertical: runs along Z
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  thickness: number;
  height: number;
  isRune: boolean;
  /** Grid row used only to group meshes for efficient frustum culling */
  row: number;
}

/**
 * Builds the single authoritative list of wall segments from logical maze data.
 * Both CollisionSystem and MazeBuilder consume this exact same list.
 *
 * Coordinates: x = (col - cols/2) * cellSize,  z = (row - rows/2) * cellSize.
 * Consecutive wall pieces on the same line are merged into one run (fewer meshes, no overlap artefacts).
 * Each run is extended by half a wall thickness at both ends so corners and T-junctions close completely.
 */
export function buildWallSegments(maze: MazeData, wallThickness = 0.45): WallSegment[] {
  const { rows, cols, cellSize, wallHeight, cells } = maze;
  const t = wallThickness;
  const half = t / 2;
  const segments: WallSegment[] = [];

  // Vertical walls: boundary lines at x index c (0..cols), cell row r sits between z index r and r+1
  for (let c = 0; c <= cols; c++) {
    const x = (c - cols / 2) * cellSize;
    let runStart = -1;
    for (let r = 0; r <= rows; r++) {
      const exists = r < rows && (c === 0 || c === cols || !cells[r][c - 1].openE);
      if (exists && runStart === -1) runStart = r;
      if (!exists && runStart !== -1) {
        const z0 = (runStart - rows / 2) * cellSize;
        const z1 = (r - rows / 2) * cellSize;
        segments.push({
          id: `v_${c}_${runStart}_${r}`,
          orientation: 'vertical',
          minX: x - half,
          maxX: x + half,
          minZ: z0 - half,
          maxZ: z1 + half,
          thickness: t,
          // Slightly lower than horizontal runs so coplanar tops never z-fight at junctions
          height: wallHeight - 0.002,
          isRune: (runStart * 3 + c * 5) % 4 === 0,
          row: runStart,
        });
        runStart = -1;
      }
    }
  }

  // Horizontal walls: boundary lines at z index r (0..rows), cell column c sits between x index c and c+1
  for (let r = 0; r <= rows; r++) {
    const z = (r - rows / 2) * cellSize;
    let runStart = -1;
    for (let c = 0; c <= cols; c++) {
      const exists = c < cols && (r === 0 || r === rows || !cells[r - 1][c].openS);
      if (exists && runStart === -1) runStart = c;
      if (!exists && runStart !== -1) {
        const x0 = (runStart - cols / 2) * cellSize;
        const x1 = (c - cols / 2) * cellSize;
        segments.push({
          id: `h_${r}_${runStart}_${c}`,
          orientation: 'horizontal',
          minX: x0 - half,
          maxX: x1 + half,
          minZ: z - half,
          maxZ: z + half,
          thickness: t,
          height: wallHeight,
          isRune: (r * 3 + runStart * 5 + 1) % 4 === 0,
          row: Math.min(r, rows - 1),
        });
        runStart = -1;
      }
    }
  }

  return segments;
}

/**
 * Creates a closed solid box (all six faces, outward-facing) for a wall run,
 * already positioned in world coordinates. Visible and raycastable from every side.
 */
export function createWallGeometry(seg: WallSegment): THREE.BufferGeometry {
  const width = seg.maxX - seg.minX;
  const depth = seg.maxZ - seg.minZ;
  const box = new THREE.BoxGeometry(width, seg.height, depth);
  box.translate((seg.minX + seg.maxX) / 2, seg.height / 2, (seg.minZ + seg.maxZ) / 2);
  const nonIndexed = box.toNonIndexed();
  box.dispose();
  return nonIndexed;
}
