/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { DIFFICULTY_PRESETS, DifficultyLevel } from '../src/types/game';
import { buildWallSegments, createWallGeometry } from '../src/game/WallGeometry';

/**
 * Regression test: every triangle of every wall solid must be wound so that its
 * geometric (right-hand rule) normal agrees with the declared vertex normal.
 * A mismatch makes the near face of a wall back-face culled (FrontSide material),
 * so the wall is seen/raycast one wall-thickness too far away or not at all.
 */
describe('Wall solid triangle winding', () => {
  const difficulties: DifficultyLevel[] = ['novice', 'explorer', 'master'];

  difficulties.forEach((diff) => {
    it(`geometric face normals match declared normals for '${diff}'`, () => {
      const maze = MazeGenerator.generate(DIFFICULTY_PRESETS[diff], 7);
      const segments = buildWallSegments(maze);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const faceNormal = new THREE.Vector3();
      const declared = new THREE.Vector3();

      for (const seg of segments) {
        const geo = createWallGeometry(seg);
        const pos = geo.getAttribute('position');
        const nor = geo.getAttribute('normal');
        for (let i = 0; i < pos.count; i += 3) {
          a.fromBufferAttribute(pos, i);
          b.fromBufferAttribute(pos, i + 1);
          c.fromBufferAttribute(pos, i + 2);
          faceNormal.subVectors(b, a).cross(c.sub(a));
          declared.fromBufferAttribute(nor, i);
          expect(faceNormal.dot(declared), `${seg.id} triangle ${i / 3}`).toBeGreaterThan(0);
        }
        geo.dispose();
      }
    });
  });
});
