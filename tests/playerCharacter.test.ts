/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerCharacter } from '../src/game/PlayerCharacter';

describe('PlayerCharacter Procedural Model & Articulation', () => {
  it('instantiates all required articulated body parts with correct joint hierarchy', () => {
    const character = new PlayerCharacter();

    // Verify root group
    expect(character.root).toBeInstanceOf(THREE.Group);
    expect(character.pelvis).toBeInstanceOf(THREE.Group);
    expect(character.spine).toBeInstanceOf(THREE.Group);
    expect(character.torsoGroup).toBeInstanceOf(THREE.Group);
    expect(character.neck).toBeInstanceOf(THREE.Group);
    expect(character.headGroup).toBeInstanceOf(THREE.Group);

    // Verify upper limbs
    expect(character.leftShoulder).toBeInstanceOf(THREE.Group);
    expect(character.leftElbow).toBeInstanceOf(THREE.Group);
    expect(character.leftHand).toBeInstanceOf(THREE.Group);
    expect(character.rightShoulder).toBeInstanceOf(THREE.Group);
    expect(character.rightElbow).toBeInstanceOf(THREE.Group);
    expect(character.rightHand).toBeInstanceOf(THREE.Group);

    // Verify lower limbs
    expect(character.leftHip).toBeInstanceOf(THREE.Group);
    expect(character.leftKnee).toBeInstanceOf(THREE.Group);
    expect(character.leftAnkle).toBeInstanceOf(THREE.Group);
    expect(character.rightHip).toBeInstanceOf(THREE.Group);
    expect(character.rightKnee).toBeInstanceOf(THREE.Group);
    expect(character.rightAnkle).toBeInstanceOf(THREE.Group);

    // Verify proportions: Young adult explorer ~1.75m tall, eye height at ~1.65m
    character.root.updateMatrixWorld(true);
    const headWorldPos = new THREE.Vector3();
    character.headGroup.getWorldPosition(headWorldPos);
    // Head joint base is at y = 1.57m; head center with eyes is at ~1.65m - 1.68m
    expect(headWorldPos.y).toBeGreaterThanOrEqual(1.50);
    expect(headWorldPos.y).toBeLessThanOrEqual(1.70);

    character.dispose();
  });

  it('correctly manages body and head visibility between first-person and third-person perspectives', () => {
    const character = new PlayerCharacter();

    // In First-Person: neck-down body is visible (torso, arms, legs, feet); head and neck are hidden
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, true);
    expect(character.root.visible).toBe(true);
    expect(character.torsoGroup.visible).toBe(true);
    expect(character.pelvis.visible).toBe(true);
    expect(character.headGroup.visible).toBe(false);
    expect(character.neck.visible).toBe(false);

    // In Third-Person: entire character body including head and neck is visible
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, false, 2.4);
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(true);
    expect(character.neck.visible).toBe(true);
    expect(character.torsoGroup.visible).toBe(true);

    character.dispose();
  });

  it('animates limbs while moving and damps to stationary stance on stop without sliding', () => {
    const character = new PlayerCharacter();

    // Simulate active sprint
    character.update(0.1, 5, 5, 0, 7.0, true, true, 0, 1, false);
    const movingLeftHipRotX = character.leftHip.rotation.x;
    expect(Math.abs(movingLeftHipRotX)).toBeGreaterThan(0.01);
    expect(character.spine.rotation.x).toBeGreaterThan(0.01); // Sprint forward lean

    // Simulate input release / stop
    for (let f = 0; f < 10; f++) {
      character.update(0.05, 5, 5, 0, 0, false, false, 0, 0, false);
    }
    // Joint rotation decays towards 0
    expect(Math.abs(character.leftHip.rotation.x)).toBeLessThan(Math.abs(movingLeftHipRotX));

    character.dispose();
  });

  it('disposes all geometries and materials cleanly without throwing', () => {
    const character = new PlayerCharacter();
    expect(() => character.dispose()).not.toThrow();
  });
});
