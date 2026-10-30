/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { DIFFICULTY_PRESETS } from '../src/types/game';
import { MazeBuilder } from '../src/game/MazeBuilder';

describe('Wall chunk streaming', () => {
  it('builds everything by default, then streams chunks in/out around the player', () => {
    const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.master, 3);
    const builder = new MazeBuilder(new THREE.Scene());
    builder.buildMaze(maze);

    const total = builder.totalChunkCount;
    expect(total).toBeGreaterThan(10);
    expect(builder.loadedChunkCount).toBe(total); // default: fully loaded (tests / title orbit view)

    // Player in a corner with a short view distance: far chunks are freed
    builder.viewDistance = 20;
    builder.updateChunks(-30, -30, 100);
    const near = builder.loadedChunkCount;
    expect(near).toBeLessThan(total);
    expect(builder.wallMeshes.length).toBe(near);

    // Walk to the opposite corner: chunks stream in gradually (load budget per call)
    builder.updateChunks(30, 30, 2);
    const after1 = builder.loadedChunkCount;
    for (let i = 0; i < 40; i++) builder.updateChunks(30, 30, 2);
    expect(builder.loadedChunkCount).toBeLessThanOrEqual(near + 100);
    expect(builder.wallMeshes.length).toBe(builder.loadedChunkCount);
    expect(after1).toBeGreaterThan(0);

    // Back to unlimited view distance: everything returns
    builder.viewDistance = Infinity;
    for (let i = 0; i < 100; i++) builder.updateChunks(0, 0, 4);
    expect(builder.loadedChunkCount).toBe(total);
    builder.dispose();
  });
});
