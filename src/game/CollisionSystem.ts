/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MazeData } from '../types/game';
import { WallSegment, buildWallSegments } from './WallGeometry';

export type { WallSegment };

export class CollisionSystem {
  private maze: MazeData;
  public wallSegments: WallSegment[] = [];
  public readonly playerRadius = 0.45;

  constructor(maze: MazeData, wallSegments?: WallSegment[]) {
    this.maze = maze;
    this.wallSegments = wallSegments ?? buildWallSegments(maze);
  }

  public updateMaze(maze: MazeData, wallSegments?: WallSegment[]) {
    this.maze = maze;
    this.wallSegments = wallSegments ?? buildWallSegments(maze);
  }

  /**
   * Resolves a circular player (radius playerRadius) against the solid wall boxes.
   * Pushes the player out along the shortest direction so they slide along walls.
   * Collision rectangles are exactly the rendered wall boxes, so what you see is what blocks you.
   */
  public resolvePosition(x: number, z: number): { x: number; z: number; collided: boolean } {
    let posX = x;
    let posZ = z;
    let collidedAny = false;
    const radius = this.playerRadius;

    // Hard safety clamp to the inside of the outer boundary walls
    const wallThick = this.wallSegments.length > 0 ? this.wallSegments[0].thickness : 0.45;
    const limitX = (this.maze.cols * this.maze.cellSize) / 2 - wallThick / 2 - radius;
    const limitZ = (this.maze.rows * this.maze.cellSize) / 2 - wallThick / 2 - radius;
    const clampBounds = () => {
      if (posX < -limitX) { posX = -limitX; collidedAny = true; }
      else if (posX > limitX) { posX = limitX; collidedAny = true; }
      if (posZ < -limitZ) { posZ = -limitZ; collidedAny = true; }
      else if (posZ > limitZ) { posZ = limitZ; collidedAny = true; }
    };
    clampBounds();

    for (let iter = 0; iter < 5; iter++) {
      let iterCollided = false;

      for (const wall of this.wallSegments) {
        // Broad phase: skip walls farther than the player radius from the rectangle
        if (
          posX < wall.minX - radius || posX > wall.maxX + radius ||
          posZ < wall.minZ - radius || posZ > wall.maxZ + radius
        ) {
          continue;
        }

        const closestX = Math.max(wall.minX, Math.min(posX, wall.maxX));
        const closestZ = Math.max(wall.minZ, Math.min(posZ, wall.maxZ));
        const dx = posX - closestX;
        const dz = posZ - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq >= radius * radius) continue;

        if (distSq > 1e-10) {
          // Circle center outside the box: push along the contact normal
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          posX += (dx / dist) * overlap;
          posZ += (dz / dist) * overlap;
        } else {
          // Circle center inside the box: push out through the nearest face
          const toMinX = posX - wall.minX;
          const toMaxX = wall.maxX - posX;
          const toMinZ = posZ - wall.minZ;
          const toMaxZ = wall.maxZ - posZ;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) posX = wall.minX - radius;
          else if (m === toMaxX) posX = wall.maxX + radius;
          else if (m === toMinZ) posZ = wall.minZ - radius;
          else posZ = wall.maxZ + radius;
        }
        iterCollided = true;
        collidedAny = true;
      }

      clampBounds();
      if (!iterCollided) break;
    }

    return { x: posX, z: posZ, collided: collidedAny };
  }
}
