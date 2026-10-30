/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/game/PlayerController';
import { CollisionSystem } from '../src/game/CollisionSystem';
import { AudioManager } from '../src/game/AudioManager';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { DIFFICULTY_PRESETS } from '../src/types/game';

describe('Camera View Toggle & Perspective Constraints', () => {
  const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 42);
  const collision = new CollisionSystem(maze);
  const audio = new AudioManager();

  it('toggles cleanly between first-person and third-person without resetting state', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200);
    const controller = new PlayerController(camera, collision, audio);
    controller.resetTo(10, 10);

    expect(controller.cameraMode).toBe('first-person');

    // Stop movement input
    controller.currentInput.moveZ = 0;
    controller.update(0.016);
    const posBefore = controller.position.clone();
    const stepsBefore = controller.stepsTaken;

    // Toggle to third-person
    const newMode = controller.toggleCameraMode();
    expect(newMode).toBe('third-person');
    expect(controller.cameraMode).toBe('third-person');

    // Run stationary updates in third person
    for (let i = 0; i < 20; i++) {
      controller.update(0.016);
    }

    // Player position and steps are preserved (no reset)
    expect(controller.position.x).toBeCloseTo(posBefore.x, 1);
    expect(controller.position.z).toBeCloseTo(posBefore.z, 1);
    expect(controller.stepsTaken).toBe(stepsBefore);

    // Toggle back to first-person
    controller.toggleCameraMode();
    expect(controller.cameraMode).toBe('first-person');
  });

  it('enforces vertical look limits so third-person camera never flips or goes under floor', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200);
    const controller = new PlayerController(camera, collision, audio);
    controller.resetTo(10, 10);
    controller.setCameraMode('third-person');

    // Attempt to look straight down beyond limit
    controller.currentInput.lookDeltaY = 5000;
    controller.update(0.016);
    expect(controller.rotationPitch).toBeLessThanOrEqual(0.45);

    // Attempt to look straight up beyond limit
    controller.currentInput.lookDeltaY = -5000;
    controller.update(0.016);
    expect(controller.rotationPitch).toBeGreaterThanOrEqual(-0.35);

    // Run updates to let camera transition and position settle
    for (let i = 0; i < 20; i++) {
      controller.update(0.016);
    }

    // Camera height must never be under the floor (y >= 0.45m)
    expect(camera.position.y).toBeGreaterThanOrEqual(0.45);

    // Camera height must never exceed maxCameraHeight (y <= 3.3m, staying well below 4.5m walls)
    expect(camera.position.y).toBeLessThanOrEqual(controller.maxCameraHeight);
  });

  it('retracts camera distance when walls occlude ideal camera distance', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200);
    const controller = new PlayerController(camera, collision, audio);
    controller.resetTo(10, 10);
    controller.setCameraMode('third-person');

    // Settle at full distance
    controller.targetThirdPersonDist = 2.4;
    for (let i = 0; i < 30; i++) {
      controller.update(0.016);
    }
    expect(controller.thirdPersonDistance).toBeCloseTo(2.4, 1);

    // Wall detected close behind player -> target distance shortened
    controller.targetThirdPersonDist = 0.85;
    // Fast retraction
    for (let i = 0; i < 10; i++) {
      controller.update(0.016);
    }
    expect(controller.thirdPersonDistance).toBeLessThan(1.2);
    expect(controller.thirdPersonDistance).toBeGreaterThanOrEqual(0.7);
  });

  it('ensures movement remains relative to camera direction in both views', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200);
    const controller = new PlayerController(camera, collision, audio);
    controller.resetTo(10, 10);

    // Turn camera 90 degrees (Math.PI / 2)
    controller.rotationYaw = Math.PI / 2;
    controller.currentInput.moveZ = 1; // Press Forward
    controller.update(0.016);

    // At yaw = PI/2, forward is -X
    expect(controller.moveWorldDirX).toBeCloseTo(-1, 2);
    expect(controller.moveWorldDirZ).toBeCloseTo(0, 2);

    // In third-person
    controller.setCameraMode('third-person');
    controller.currentInput.moveZ = 1;
    controller.update(0.016);

    expect(controller.moveWorldDirX).toBeCloseTo(-1, 2);
    expect(controller.moveWorldDirZ).toBeCloseTo(0, 2);
  });
});
