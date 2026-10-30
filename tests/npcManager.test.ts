/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { DIFFICULTY_PRESETS, DifficultyLevel } from '../src/types/game';
import { buildWallSegments } from '../src/game/WallGeometry';
import { CollisionSystem } from '../src/game/CollisionSystem';
import { NpcManager } from '../src/game/NpcManager';

describe('NpcManager wanderers', () => {
  const expected: Record<string, number> = { novice: 3, explorer: 4, master: 5 };

  (['novice', 'explorer', 'master'] as DifficultyLevel[]).forEach((diff) => {
    it(`spawns ${expected[diff]} NPCs for '${diff}' away from start and exit, and they never touch walls`, () => {
      const maze = MazeGenerator.generate(DIFFICULTY_PRESETS[diff], 11);
      const collision = new CollisionSystem(maze, buildWallSegments(maze));
      const scene = new THREE.Scene();
      const npcs = new NpcManager(scene);
      npcs.spawn(maze);
      expect(npcs.count).toBe(expected[diff]);

      for (let i = 0; i < 1200; i++) {
        npcs.update(1 / 30, 1e6, 1e6, 0);
        for (const p of npcs.getPositions()) {
          // A point exactly on the corridor centre line must never be pushed by a wall
          const r = collision.resolvePosition(p.x, p.z);
          expect(Math.abs(r.x - p.x)).toBeLessThan(1e-6);
          expect(Math.abs(r.z - p.z)).toBeLessThan(1e-6);
        }
      }
      npcs.dispose();
    });
  });

  it('is deterministic for the same seed and moves over time', () => {
    const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 5);
    const a = new NpcManager(new THREE.Scene());
    const b = new NpcManager(new THREE.Scene());
    a.spawn(maze);
    b.spawn(maze);
    expect(a.getPositions()).toEqual(b.getPositions());
    const before = a.getPositions();
    for (let i = 0; i < 300; i++) a.update(1 / 30, 1e6, 1e6, 0);
    expect(a.getPositions()).not.toEqual(before);
    a.dispose();
    b.dispose();
  });

  it('a hit in front of the player freezes the NPC briefly', () => {
    const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 5);
    const npcs = new NpcManager(new THREE.Scene());
    npcs.spawn(maze);
    const target = npcs.getPositions()[0];
    // Stand 1.5 m south of the NPC looking north: forward = (-sin yaw, -cos yaw) = (0,-1) at yaw = 0
    const px = target.x;
    const pz = target.z + 1.5;
    npcs.queueHit();
    for (let i = 0; i < 10; i++) npcs.update(0.03, px, pz, 0);
    const frozen = npcs.getPositions()[0];
    for (let i = 0; i < 10; i++) npcs.update(0.03, 1e6, 1e6, 0);
    expect(npcs.getPositions()[0]).toEqual(frozen);
    npcs.dispose();
  });

  it('is solid: pushes an overlapping player out and waits when the player blocks its way', () => {
    const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 5);
    const npcs = new NpcManager(new THREE.Scene());
    npcs.spawn(maze);
    const t = npcs.getPositions()[0];
    const out = npcs.pushPlayerOut(t.x + 0.2, t.z);
    expect(Math.hypot(out.x - t.x, out.z - t.z)).toBeGreaterThanOrEqual(0.849);
    // No overlap -> unchanged
    const far = npcs.pushPlayerOut(t.x + 3, t.z);
    expect(far.x).toBeCloseTo(t.x + 3, 6);
    npcs.dispose();
  });
});
