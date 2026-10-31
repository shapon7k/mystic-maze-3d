/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { buildWallSegments } from '../src/game/WallGeometry';
import { CollisionSystem } from '../src/game/CollisionSystem';
import { EnemyManager } from '../src/game/EnemyManager';

function setup() {
  const maze = MazeGenerator.generatePlayground();
  const collision = new CollisionSystem(maze, buildWallSegments(maze));
  const enemies = new EnemyManager(new THREE.Scene(), (x, z) => collision.resolvePosition(x, z));
  enemies.spawn(maze);
  return { maze, collision, enemies };
}

describe('EnemyManager (Playground enemies)', () => {
  it('spawns four enemies that stay inside the arena', () => {
    const { enemies } = setup();
    expect(enemies.count).toBe(4);
    for (let i = 0; i < 2000; i++) enemies.update(1 / 30, 1e5, 1e5, 0);
    for (const p of enemies.getPositions()) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(30);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(30);
    }
  });

  it('chases a nearby player and hurts him with a delayed strike', () => {
    const { enemies } = setup();
    const target = enemies.getPositions()[0];
    const px = target.x + 8; // inside detection range
    const pz = target.z;
    const d0 = Math.hypot(px - target.x, pz - target.z);
    let damage = 0;
    for (let i = 0; i < 300; i++) damage += enemies.update(1 / 30, px, pz, 0);
    const now = enemies.getPositions()[0];
    expect(Math.hypot(px - now.x, pz - now.z)).toBeLessThan(d0 - 4);
    expect(damage).toBeGreaterThan(0);
    expect(damage % 10).toBe(0); // 10 damage per strike
  });

  it('dies after two player hits and respawns later', () => {
    const { enemies } = setup();
    const t = enemies.getPositions()[0];
    // Player stands 1.5 m south of the enemy looking north (yaw 0 -> forward -Z)
    const px = t.x;
    const pz = t.z + 1.5;
    for (let hit = 0; hit < 2; hit++) {
      enemies.queueHit();
      for (let i = 0; i < 40; i++) enemies.update(0.02, px, pz, 0);
    }
    expect(enemies.aliveCount).toBeLessThan(4);
    for (let i = 0; i < 20 * 30; i++) enemies.update(1 / 30, 1e5, 1e5, 0);
    expect(enemies.aliveCount).toBe(4);
  });

  it('is solid: pushes an overlapping player out', () => {
    const { enemies } = setup();
    const t = enemies.getPositions()[0];
    const out = enemies.pushPlayerOut(t.x + 0.2, t.z);
    expect(Math.hypot(out.x - t.x, out.z - t.z)).toBeGreaterThanOrEqual(0.849);
  });
});
