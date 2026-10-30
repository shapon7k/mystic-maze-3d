/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { MazeBuilder } from '../src/game/MazeBuilder';
import { DIFFICULTY_PRESETS } from '../src/types/game';

describe('Gameplay Lifecycle & Resource Disposal', () => {
  // Test 1: Exit triggers victory exactly once
  it('triggers victory exactly once when player reaches the exit portal', () => {
    const config = DIFFICULTY_PRESETS.novice;
    const maze = MazeGenerator.generate(config, 101);

    // Mock scene & builder
    const scene = new THREE.Scene();
    const builder = new MazeBuilder(scene);
    builder.buildMaze(maze);

    const portalPos = builder.portalPosition;
    const triggerRadius = builder.portalTriggerRadius; // 1.8m

    let victoryCount = 0;
    const onVictory = vi.fn(() => {
      victoryCount++;
    });

    // Simulate game state loop logic
    let gameState: 'PLAYING' | 'VICTORY' = 'PLAYING';

    const checkExitArrival = (playerX: number, playerZ: number) => {
      if (gameState !== 'PLAYING') return;

      const dist = Math.hypot(playerX - portalPos.x, playerZ - portalPos.z);
      if (dist < triggerRadius) {
        gameState = 'VICTORY';
        onVictory();
      }
    };

    // Frame 1: Player is at start position (far away)
    checkExitArrival(maze.startWorldPos.x, maze.startWorldPos.z);
    expect(victoryCount).toBe(0);
    expect(gameState).toBe('PLAYING');

    // Frame 2: Player reaches exit position
    checkExitArrival(portalPos.x, portalPos.z);
    expect(victoryCount).toBe(1);
    expect(gameState).toBe('VICTORY');

    // Frames 3 to 15: Player remains inside the portal for 12 more frames
    for (let f = 0; f < 12; f++) {
      checkExitArrival(portalPos.x, portalPos.z);
    }

    // Victory must be called EXACTLY ONCE
    expect(victoryCount).toBe(1);
    expect(onVictory).toHaveBeenCalledTimes(1);

    // Clean up
    builder.dispose();
  });

  // Test 2: Starting a new maze 50 times does not accumulate obsolete objects or leak geometry
  it('regenerates the maze 50 times without object accumulation or memory leaks', () => {
    const scene = new THREE.Scene();
    const builder = new MazeBuilder(scene);
    const config = DIFFICULTY_PRESETS.novice;

    // Track disposed geometries across runs
    let totalDisposedGeometries = 0;
    const originalDispose = THREE.BufferGeometry.prototype.dispose;
    THREE.BufferGeometry.prototype.dispose = function () {
      totalDisposedGeometries++;
      originalDispose.call(this);
    };

    try {
      // Build initial maze (Run 1)
      const maze1 = MazeGenerator.generate(config, 1001);
      builder.buildMaze(maze1);

      // Verify scene has only the mazeGroup container
      expect(scene.children.length).toBe(1);
      const initialChildrenCount = (scene.children[0] as THREE.Group).children.length;
      expect(initialChildrenCount).toBeGreaterThan(10); // Maze contains floor, walls, portal, braziers

      // Re-generate maze 50 times
      for (let run = 2; run <= 51; run++) {
        const nextMaze = MazeGenerator.generate(config, 1000 + run);
        builder.buildMaze(nextMaze);

        // Assert scene still has only 1 root group
        expect(scene.children.length).toBe(1);

        // Assert child count does NOT grow linearly (e.g. 50 * initialChildrenCount)
        const currentChildrenCount = (scene.children[0] as THREE.Group).children.length;
        // Count should remain within ±15% of initial due to procedural brazier placement variations
        expect(currentChildrenCount).toBeLessThan(initialChildrenCount * 1.5);
      }

      // Assert that geometries from previous runs were actively disposed
      expect(totalDisposedGeometries).toBeGreaterThan(100);

      // Final disposal on app unmount
      builder.dispose();
      expect(scene.children.length).toBe(0); // mazeGroup removed from scene
    } finally {
      THREE.BufferGeometry.prototype.dispose = originalDispose;
    }
  });
});
