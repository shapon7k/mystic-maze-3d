/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../src/game/PlayerController';
import { PlayerCharacter } from '../src/game/PlayerCharacter';
import { CollisionSystem } from '../src/game/CollisionSystem';
import { AudioManager } from '../src/game/AudioManager';
import { MazeGenerator } from '../src/game/MazeGenerator';
import { DIFFICULTY_PRESETS } from '../src/types/game';

describe('Screen-Space Focus, View Transitions & Facing Direction Consistency', () => {
  const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 42);
  const collisionSystem = new CollisionSystem(maze);
  const audioManager = new AudioManager();

  it('projects camera focus point near screen center for several yaw and pitch values in third-person', () => {
    // Test both landscape (16:9) and mobile portrait (9:19.5, aspect ~ 0.46)
    const testAspects = [16 / 9, 9 / 16, 0.46];
    const testYaws = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    const testPitches = [-0.35, -0.15, 0.0, 0.20, 0.45];

    for (const aspect of testAspects) {
      const camera = new THREE.PerspectiveCamera(75, aspect, 0.05, 200);
      const controller = new PlayerController(camera, collisionSystem, audioManager);
      controller.resetTo(10, 10);
      controller.setCameraMode('third-person');

      // Let transition settle to third-person
      for (let i = 0; i < 25; i++) {
        controller.update(0.016);
      }

      for (const yaw of testYaws) {
        for (const pitch of testPitches) {
          controller.rotationYaw = yaw;
          controller.rotationPitch = pitch;
          controller.update(0.016);

          // Projected focus point in Normalized Device Coordinates (NDC: [-1, 1])
          const focusPoint = new THREE.Vector3(
            controller.position.x,
            controller.cameraFocusY,
            controller.position.z
          );

          camera.updateMatrixWorld(true);
          focusPoint.project(camera);

          // Focus point must be horizontally centered (x ~ 0)
          expect(Math.abs(focusPoint.x)).toBeLessThanOrEqual(0.05);

          // Focus point must be near the vertical middle of the screen (y ~ 0)
          expect(Math.abs(focusPoint.y)).toBeLessThanOrEqual(0.05);

          // In neutral and looking-down pitch, camera is positioned above focus point
          if (pitch >= 0) {
            expect(camera.position.y).toBeGreaterThan(controller.cameraFocusY);
          }
        }
      }
    }
  });

  it('ensures camera view-switch transition always finishes completely and never leaves camera in-between', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const controller = new PlayerController(camera, collisionSystem, audioManager);
    controller.resetTo(10, 10);

    expect(controller.cameraMode).toBe('first-person');
    expect(controller.cameraTransitionProgress).toBe(0.0);

    // Switch to third-person
    controller.toggleCameraMode();
    expect(controller.cameraMode).toBe('third-person');

    // Step forward frames
    for (let i = 0; i < 40; i++) {
      controller.update(0.016);
    }
    // Transition must strictly finish at 1.0 (not stuck at 0.98 or in-between)
    expect(controller.cameraTransitionProgress).toBe(1.0);

    // Switch back to first-person
    controller.toggleCameraMode();
    expect(controller.cameraMode).toBe('first-person');

    for (let i = 0; i < 40; i++) {
      controller.update(0.016);
    }
    // Transition must strictly finish at 0.0 (not stuck at 0.02 or in-between)
    expect(controller.cameraTransitionProgress).toBe(0.0);
  });

  it('keeps character model facing consistent with player forward direction across all states without 180-deg flips', () => {
    const character = new PlayerCharacter();

    // 1. First-person stationary facing
    const testYaw = Math.PI * 0.3; // arbitrary camera yaw
    character.update(0.016, 0, 0, testYaw, 0, false, false, 0, 0, true);
    // Model front (+Z) faces player forward vector: cameraYaw + PI
    const expectedForwardFacing = testYaw + Math.PI;
    expect(character.root.rotation.y).toBeCloseTo(expectedForwardFacing, 3);

    // 2. Third-person stationary facing
    character.update(0.016, 0, 0, testYaw, 0, false, false, 0, 0, false);
    // Smooth damp towards expectedForwardFacing
    for (let i = 0; i < 30; i++) {
      character.update(0.016, 0, 0, testYaw, 0, false, false, 0, 0, false);
    }
    expect(character.root.rotation.y).toBeCloseTo(expectedForwardFacing, 2);

    // 3. Third-person moving forward: move vector is (-sin(yaw), -cos(yaw))
    const moveDirX = -Math.sin(testYaw);
    const moveDirZ = -Math.cos(testYaw);

    character.update(0.016, 0, 0, testYaw, 4.2, true, false, moveDirX, moveDirZ, false);
    for (let i = 0; i < 30; i++) {
      character.update(0.016, 0, 0, testYaw, 4.2, true, false, moveDirX, moveDirZ, false);
    }

    // Moving forward angle matches standing still facing angle: NO 180-degree flip!
    expect(character.root.rotation.y).toBeCloseTo(expectedForwardFacing, 2);

    // 4. Stopping movement: release joystick (isMoving = false)
    for (let i = 0; i < 30; i++) {
      character.update(0.016, 0, 0, testYaw, 0, false, false, 0, 0, false);
    }
    // Facing direction remains stable without flipping 180 degrees
    expect(character.root.rotation.y).toBeCloseTo(expectedForwardFacing, 2);

    character.dispose();
  });

  it('third person: orbiting the camera while stationary does not turn the character (Free Fire style)', () => {
    const character = new PlayerCharacter();
    character.update(0.016, 0, 0, 0.4, 0, false, false, 0, 0, true); // facing set from first person
    const facing = character.root.rotation.y;

    // Swing the camera all the way around the stationary character
    for (let yaw = 0.4; yaw < 0.4 + Math.PI * 2; yaw += 0.1) {
      for (let i = 0; i < 5; i++) {
        character.update(0.016, 0, 0, yaw, 0, false, false, 0, 0, false);
      }
      expect(character.root.rotation.y).toBeCloseTo(facing, 6);
    }

    // Walking turns it toward the travel direction (e.g. towards +X)
    for (let i = 0; i < 60; i++) {
      character.update(0.016, 0, 0, 1.0, 4.2, true, false, 1, 0, false);
    }
    expect(Math.sin(character.root.rotation.y)).toBeGreaterThan(0.95);
    expect(character.facingYaw).toBeCloseTo(character.root.rotation.y - Math.PI, 6);
    character.dispose();
  });
});
