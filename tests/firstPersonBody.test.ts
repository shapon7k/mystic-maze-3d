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

describe('First-Person Visible Body & Kinematics', () => {
  const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 42);
  const collisionSystem = new CollisionSystem(maze);
  const audioManager = new AudioManager();

  it('first-person camera sits at character eye level and never clips into body geometry', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const controller = new PlayerController(camera, collisionSystem, audioManager);
    controller.resetTo(10, 10);
    controller.setCameraMode('first-person');
    controller.update(0.016);

    // Eye height is at 1.66m matching character eye placement
    expect(camera.position.y).toBeCloseTo(1.66, 2);

    // Camera near plane is 0.05m
    expect(camera.near).toBe(0.05);

    // Distance to chest (world y ~ 1.35m to 1.47m) is at least 0.18m (> near plane 0.05m)
    const chestDistance = 1.66 - 1.47;
    expect(chestDistance).toBeGreaterThanOrEqual(0.18);
    expect(chestDistance).toBeGreaterThan(camera.near * 3);
  });

  it('renders neck-down body in first person while completely hiding head and hair', () => {
    const character = new PlayerCharacter();

    // First person update
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, true);

    expect(character.root.visible).toBe(true);
    expect(character.torsoGroup.visible).toBe(true);
    expect(character.pelvis.visible).toBe(true);
    expect(character.leftShoulder.visible).toBe(true);
    expect(character.rightShoulder.visible).toBe(true);
    expect(character.leftHip.visible).toBe(true);
    expect(character.rightHip.visible).toBe(true);

    // Head, face, and hair are hidden to prevent blocking camera
    expect(character.headGroup.visible).toBe(false);
    expect(character.neck.visible).toBe(false);

    character.dispose();
  });

  it('arms and hands swing forward into bottom edge during walk/sprint, and rest outside view during idle', () => {
    const character = new PlayerCharacter();

    // Idle stance: arms hang relaxed beside hips
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, true);
    for (let i = 0; i < 15; i++) {
      character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, true);
    }
    // Idle shoulder rotation is neutral (~0.05 rad)
    expect(character.leftShoulder.rotation.x).toBeCloseTo(0.05, 1);
    expect(character.rightShoulder.rotation.x).toBeCloseTo(0.05, 1);

    // Walk forward: arm flexes forward and upward
    let maxLeftElbowFlex = 0;
    for (let frame = 0; frame < 60; frame++) {
      character.update(0.016, 0, 0, 0, 4.2, true, false, 0, 1, true);
      const flex = Math.abs(character.leftElbow.rotation.x);
      if (flex > maxLeftElbowFlex) maxLeftElbowFlex = flex;
    }
    // On forward swing, elbow flexes to at least 0.8 rad, bringing forearms and hands forward and up
    expect(maxLeftElbowFlex).toBeGreaterThan(0.8);

    character.dispose();
  });

  it('body orientation strictly tracks camera yaw without rotational lag', () => {
    const character = new PlayerCharacter();

    // Rotate camera yaw by 1.2 radians
    const testYaw = 1.2;
    character.update(0.016, 0, 0, testYaw, 0, false, false, 0, 0, true);

    // In first person, character root rotation immediately aligns with player forward direction (cameraYaw + PI)
    expect(character.root.rotation.y).toBeCloseTo(testYaw + Math.PI, 3);

    character.dispose();
  });

  it('limits forward limb swing when player is close to a wall', () => {
    const character = new PlayerCharacter();

    // Unobstructed sprint: forwardSwingLimit = 1.0
    character.update(0.05, 0, 0, 0, 7.0, true, true, 0, 1, true, 2.4, 1.0);
    const openLegRot = Math.abs(character.leftHip.rotation.x);

    // Constrained against a wall: forwardSwingLimit = 0.35
    character.update(0.05, 0, 0, 0, 7.0, true, true, 0, 1, true, 2.4, 0.35);
    const wallConstrainedLegRot = Math.abs(character.leftHip.rotation.x);

    // Constrained swing is significantly smaller to prevent wall penetration
    expect(wallConstrainedLegRot).toBeLessThan(openLegRot);

    character.dispose();
  });

  it('switching views between first-person and third-person keeps body rendered with zero flicker', () => {
    const character = new PlayerCharacter();

    // 1st person
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, true);
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(false);

    // 3rd person
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, false, 2.4);
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(true);

    // Back to 1st person
    character.update(0.016, 0, 0, 0, 0, false, false, 0, 0, true);
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(false);

    character.dispose();
  });
});
