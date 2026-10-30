/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { DIFFICULTY_PRESETS, DifficultyLevel, GridCoord, MazeData, getOpenNeighbors } from '../src/types/game';
import { buildWallSegments } from '../src/game/WallGeometry';
import { CollisionSystem } from '../src/game/CollisionSystem';
import { MazeBuilder } from '../src/game/MazeBuilder';

const WALL_HALF = 0.225;
const OFFSET = 0.8; // ray start distance from the wall centre line
const EXPECTED_HIT = OFFSET - WALL_HALF; // 0.575 m

describe('Wall mesh & collision parity (square maze, single source of truth)', () => {
  const difficulties: DifficultyLevel[] = ['novice', 'explorer', 'master'];

  difficulties.forEach((diff) => {
    it(`'${diff}': every closed boundary is hit from both sides and blocks the player; every open boundary has no wall and lets the player pass`, () => {
      const config = DIFFICULTY_PRESETS[diff];
      const scene = new THREE.Scene();
      const builder = new MazeBuilder(scene);
      const raycaster = new THREE.Raycaster();
      const origin = new THREE.Vector3();
      const dir = new THREE.Vector3();

      const cast = (ox: number, oz: number, dx: number, dz: number, y: number) => {
        origin.set(ox, y, oz);
        dir.set(dx, 0, dz);
        raycaster.set(origin, dir);
        raycaster.far = OFFSET * 2;
        return raycaster.intersectObjects(builder.wallMeshes, false);
      };

      for (let seed = 0; seed < 100; seed++) {
        const maze = MazeGenerator.generate(config, seed);
        const segments = buildWallSegments(maze);
        const collision = new CollisionSystem(maze, segments);
        builder.buildMaze(maze, segments);

        const { rows, cols, cellSize, wallHeight, cells } = maze;
        const y = wallHeight * 0.5;
        const radius = collision.playerRadius;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const center = MazeGenerator.cellToWorld(maze, r, c);
            const cell = cells[r][c];

            // Boundaries owned by this cell: East and South (+ West / North on the outer edge)
            const boundaries: { name: string; closed: boolean; bx: number; bz: number; nx: number; nz: number }[] = [
              { name: 'E', closed: c === cols - 1 || !cell.openE, bx: center.x + cellSize / 2, bz: center.z, nx: 1, nz: 0 },
              { name: 'S', closed: r === rows - 1 || !cell.openS, bx: center.x, bz: center.z + cellSize / 2, nx: 0, nz: 1 },
            ];
            if (c === 0) boundaries.push({ name: 'W', closed: true, bx: center.x - cellSize / 2, bz: center.z, nx: -1, nz: 0 });
            if (r === 0) boundaries.push({ name: 'N', closed: true, bx: center.x, bz: center.z - cellSize / 2, nx: 0, nz: -1 });

            for (const b of boundaries) {
              const hitsFwd = cast(b.bx - b.nx * OFFSET, b.bz - b.nz * OFFSET, b.nx, b.nz, y);
              const hitsBack = cast(b.bx + b.nx * OFFSET, b.bz + b.nz * OFFSET, -b.nx, -b.nz, y);
              const where = `seed ${seed} ${diff} cell (${r},${c}) ${b.name}`;
              const res = collision.resolvePosition(b.bx, b.bz);

              if (b.closed) {
                expect(hitsFwd.length, `${where}: ray missed closed wall`).toBeGreaterThanOrEqual(1);
                expect(hitsBack.length, `${where}: back ray missed closed wall`).toBeGreaterThanOrEqual(1);
                expect(hitsFwd[0].distance).toBeCloseTo(EXPECTED_HIT, 1);
                expect(hitsBack[0].distance).toBeCloseTo(EXPECTED_HIT, 1);
                expect(res.collided, `${where}: collision missing on closed wall`).toBe(true);

                // Walk from the cell centre straight at the wall: must be stopped short of it
                let x = center.x;
                let z = center.z;
                for (let step = 0; step < 60; step++) {
                  const next = collision.resolvePosition(x + b.nx * 0.1, z + b.nz * 0.1);
                  x = next.x;
                  z = next.z;
                }
                const along = (x - b.bx) * b.nx + (z - b.bz) * b.nz; // negative = still inside the cell
                expect(along, `${where}: player tunnelled through closed wall`).toBeLessThanOrEqual(-(radius + WALL_HALF) + 1e-3);
              } else {
                expect(hitsFwd.length, `${where}: wall mesh across open passage`).toBe(0);
                expect(hitsBack.length, `${where}: wall mesh across open passage`).toBe(0);
                expect(res.collided, `${where}: open passage blocks the player`).toBe(false);
              }
            }
          }
        }

        builder.clear();
      }
    }, 120000);
  });

  it('walks the whole Start-to-End route without ever being blocked', () => {
    for (const diff of difficulties) {
      for (const seed of [101, 202, 303, 777, 9999]) {
        const maze = MazeGenerator.generate(DIFFICULTY_PRESETS[diff], seed);
        const collision = new CollisionSystem(maze, buildWallSegments(maze));
        const path = findPath(maze);
        expect(path.length).toBeGreaterThanOrEqual(2);

        let pos = MazeGenerator.cellToWorld(maze, path[0].row, path[0].col);
        for (let i = 1; i < path.length; i++) {
          const target = MazeGenerator.cellToWorld(maze, path[i].row, path[i].col);
          const steps = Math.ceil(Math.hypot(target.x - pos.x, target.z - pos.z) / 0.1);
          const dx = (target.x - pos.x) / steps;
          const dz = (target.z - pos.z) / steps;
          for (let s = 0; s < steps; s++) {
            const wantedX = pos.x + dx;
            const wantedZ = pos.z + dz;
            const res = collision.resolvePosition(wantedX, wantedZ);
            expect(Math.hypot(res.x - wantedX, res.z - wantedZ), `${diff} seed ${seed}: blocked on open route`).toBeLessThan(0.02);
            pos = res;
          }
        }
        expect(Math.hypot(pos.x - maze.endWorldPos.x, pos.z - maze.endWorldPos.z)).toBeLessThan(0.1);
      }
    }
  });

  it('walls close completely at every corner and junction (no gaps)', () => {
    for (const diff of difficulties) {
      const maze = MazeGenerator.generate(DIFFICULTY_PRESETS[diff], 42);
      const scene = new THREE.Scene();
      const builder = new MazeBuilder(scene);
      builder.buildMaze(maze, buildWallSegments(maze));

      const { rows, cols, cellSize, wallHeight, cells } = maze;
      const raycaster = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const origin = new THREE.Vector3();
      let verticesWithWalls = 0;

      for (let vr = 0; vr <= rows; vr++) {
        for (let vc = 0; vc <= cols; vc++) {
          // Walls meeting at grid vertex (vr, vc)
          const northWall = vr > 0 && (vc === 0 || vc === cols || !cells[vr - 1][vc - 1].openE);
          const southWall = vr < rows && (vc === 0 || vc === cols || !cells[vr][vc - 1].openE);
          const westWall = vc > 0 && (vr === 0 || vr === rows || !cells[vr - 1][vc - 1].openS);
          const eastWall = vc < cols && (vr === 0 || vr === rows || !cells[vr - 1][vc].openS);
          const anyWall = northWall || southWall || westWall || eastWall;
          const vx = (vc - cols / 2) * cellSize;
          const vz = (vr - rows / 2) * cellSize;
          if (anyWall) verticesWithWalls++;

          for (const [ox, oz] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) {
            origin.set(vx + ox, wallHeight + 2, vz + oz);
            raycaster.set(origin, down);
            raycaster.far = wallHeight + 4;
            const hits = raycaster.intersectObjects(builder.wallMeshes, false);
            if (anyWall) {
              expect(hits.length, `${diff}: gap at vertex (${vr},${vc}) offset (${ox},${oz})`).toBeGreaterThanOrEqual(1);
            } else {
              expect(hits.length, `${diff}: phantom wall at vertex (${vr},${vc})`).toBe(0);
            }
          }
        }
      }

      expect(verticesWithWalls).toBeGreaterThan(rows + cols);
      builder.clear();
    }
  });
});

/** BFS pathfinder for tests only: Start -> End route through open passages. */
function findPath(maze: MazeData): GridCoord[] {
  const key = (c: GridCoord) => `${c.row},${c.col}`;
  const parent = new Map<string, GridCoord | null>([[key(maze.startCoord), null]]);
  const queue: GridCoord[] = [maze.startCoord];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.row === maze.endCoord.row && cur.col === maze.endCoord.col) {
      const path: GridCoord[] = [];
      let step: GridCoord | null = cur;
      while (step) {
        path.unshift(step);
        step = parent.get(key(step)) ?? null;
      }
      return path;
    }
    for (const n of getOpenNeighbors(maze, cur.row, cur.col)) {
      if (!parent.has(key(n))) {
        parent.set(key(n), cur);
        queue.push(n);
      }
    }
  }
  return [];
}
