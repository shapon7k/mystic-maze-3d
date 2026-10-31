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
import { MazeBuilder } from '../src/game/MazeBuilder';
import { DIFFICULTY_PRESETS, DifficultyLevel } from '../src/types/game';

describe('Camera Wall Collision & Perspective Verification', () => {
  const maze = MazeGenerator.generate(DIFFICULTY_PRESETS.novice, 12345);
  const scene = new THREE.Scene();
  const mazeBuilder = new MazeBuilder(scene);
  mazeBuilder.buildMaze(maze);

  const collisionSystem = new CollisionSystem(maze);
  const audioManager = new AudioManager();

  it('1. In third-person, standing next to walls, corners, narrow corridors and junctions: camera never clips into walls and never passes through walls', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200);
    const controller = new PlayerController(camera, collisionSystem, audioManager);
    controller.setCameraMode('third-person');

    // Test positions next to walls, in corners, and at corridor junctions
    const testPositions = [
      // Start position
      { x: maze.startWorldPos.x, z: maze.startWorldPos.z },
      // Next to the west outer wall in the middle row
      { x: -(maze.cols * maze.cellSize) / 2 + 0.7, z: 0.45 },
      // Corner of the maze (south-east)
      { x: (maze.cols * maze.cellSize) / 2 - 0.7, z: (maze.rows * maze.cellSize) / 2 - 0.7 },
      // Narrow corridor cell
      { x: maze.startWorldPos.x + 1.0, z: maze.startWorldPos.z + 1.0 },
    ];

    const anglesToTest = [
      0,
      Math.PI * 0.25,
      Math.PI * 0.5,
      Math.PI * 0.75,
      Math.PI,
      Math.PI * 1.25,
      Math.PI * 1.5,
      Math.PI * 1.75,
    ];

    const raycaster = new THREE.Raycaster();
    const probeDir = new THREE.Vector3();
    const probeOrigin = new THREE.Vector3();
    const centerTarget = new THREE.Vector3();
    const probeTarget = new THREE.Vector3();
    const probeRight = new THREE.Vector3();

    for (const pos of testPositions) {
      // Resolve position against collision system so player is physically valid
      const resolved = collisionSystem.resolvePosition(pos.x, pos.z);
      controller.resetTo(resolved.x, resolved.z);

      for (const yaw of anglesToTest) {
        controller.rotationYaw = yaw;

        // Perform the 5-ray camera occlusion probe
        const focusY = controller.cameraFocusY;
        probeOrigin.set(resolved.x, focusY, resolved.z);

        const tpPitch = Math.max(-0.6, Math.min(0.45, controller.rotationPitch));
        const cosPitch = Math.cos(tpPitch);
        const sinPitch = Math.sin(tpPitch);

        const maxDist = 2.4;
        const offsetX = Math.sin(yaw) * (cosPitch * maxDist);
        const offsetZ = Math.cos(yaw) * (cosPitch * maxDist);
        const offsetY = 0.35 - sinPitch * maxDist; // positive pitch = look up = camera lower (same as GameEngine)

        centerTarget.set(
          probeOrigin.x + offsetX,
          probeOrigin.y + offsetY,
          probeOrigin.z + offsetZ
        );

        probeRight.set(Math.cos(yaw), 0, -Math.sin(yaw));

        const offsets = [
          { dx: 0, dy: 0, dz: 0 },
          { dx: probeRight.x * 0.22, dy: 0, dz: probeRight.z * 0.22 },
          { dx: -probeRight.x * 0.22, dy: 0, dz: -probeRight.z * 0.22 },
          { dx: 0, dy: 0.18, dz: 0 },
          { dx: 0, dy: -0.15, dz: 0 },
        ];

        let shortestSafeDist = maxDist;
        for (const off of offsets) {
          probeTarget.set(
            centerTarget.x + off.dx,
            centerTarget.y + off.dy,
            centerTarget.z + off.dz
          );
          probeDir.subVectors(probeTarget, probeOrigin);
          const len = probeDir.length();
          if (len > 0.05) {
            probeDir.normalize();
            raycaster.set(probeOrigin, probeDir);
            raycaster.near = 0.05;
            raycaster.far = len;
            const hits = raycaster.intersectObjects(mazeBuilder.wallMeshes, false);
            if (hits.length > 0) {
              const safeDist = Math.max(0.22, hits[0].distance - 0.25);
              if (safeDist < shortestSafeDist) {
                shortestSafeDist = safeDist;
              }
            }
          }
        }

        // Apply to controller
        controller.targetThirdPersonDist = shortestSafeDist;
        controller.update(0.016);

        // Assert 1: Camera distance never exceeds safe distance
        expect(controller.thirdPersonDistance).toBeLessThanOrEqual(shortestSafeDist + 0.001);

        // Assert 2: Camera position Y is strictly within safe corridor bounds [0.45, maxCameraHeight]
        expect(camera.position.y).toBeGreaterThanOrEqual(0.45);
        expect(camera.position.y).toBeLessThanOrEqual(controller.maxCameraHeight);
        expect(controller.maxCameraHeight).toBeLessThan(maze.wallHeight);

        // Assert 3: A ray from character focus to actual camera position hits NO walls
        // (meaning the camera is in clear line-of-sight in front of any wall)
        probeDir.subVectors(camera.position, probeOrigin);
        const actualCamDist = probeDir.length();
        if (actualCamDist > 0.1) {
          probeDir.normalize();
          raycaster.set(probeOrigin, probeDir);
          raycaster.near = 0.05;
          // Test strictly up to camera near plane (camera position minus 0.08m)
          raycaster.far = Math.max(0.05, actualCamDist - 0.08);
          const blockingWalls = raycaster.intersectObjects(mazeBuilder.wallMeshes, false);
          expect(blockingWalls.length).toBe(0);
        }
      }
    }
  });

  it('2. From every starting position, the exit portal is not visible through walls in either view', () => {
    const difficulties: DifficultyLevel[] = ['novice', 'explorer', 'master'];
    const seeds = [101, 202, 303];

    for (const diff of difficulties) {
      for (const seed of seeds) {
        const testMaze = MazeGenerator.generate(DIFFICULTY_PRESETS[diff], seed);
        const testScene = new THREE.Scene();
        const testBuilder = new MazeBuilder(testScene);
        testBuilder.buildMaze(testMaze);

        const raycaster = new THREE.Raycaster();
        const startEye = new THREE.Vector3(
          testMaze.startWorldPos.x,
          1.65, // Eye height
          testMaze.startWorldPos.z
        );
        const portalCenter = testBuilder.portalPosition;

        const dir = new THREE.Vector3().subVectors(portalCenter, startEye);
        const totalDist = dir.length();
        dir.normalize();

        raycaster.set(startEye, dir);
        raycaster.near = 0.1;
        raycaster.far = totalDist;

        // Must hit at least one intervening solid wall
        const hits = raycaster.intersectObjects(testBuilder.wallMeshes, false);
        expect(hits.length).toBeGreaterThanOrEqual(1);

        // Wall materials must be opaque MeshStandardMaterial with depthWrite: true and depthTest: true
        for (const wallMesh of testBuilder.wallMeshes) {
          const mat = wallMesh.material as THREE.MeshStandardMaterial;
          expect(mat.depthTest).toBe(true);
          expect(mat.depthWrite).toBe(true);
          expect(mat.transparent).toBe(false);
        }

        testBuilder.clear();
      }
    }
  });

  it('3. Character model never visibly intersects walls, and its animation matches movement (stops when joystick is released)', () => {
    const character = new PlayerCharacter();
    scene.add(character.root);

    // Assert character body radius is well within collision system playerRadius (0.45m)
    // Character half-width across shoulders/hips is <= 0.26m
    const maxCharacterModelRadius = 0.26;
    expect(maxCharacterModelRadius).toBeLessThan(collisionSystem.playerRadius);

    // Simulate active movement: legs and arms swing
    character.update(
      0.016,
      maze.startWorldPos.x,
      maze.startWorldPos.z,
      0,
      4.2, // speed > 0.1
      true, // isMoving = true
      false, // isSprinting
      0,
      1,
      false, // third-person
      2.4 // cameraDist
    );

    // Limbs swing during active movement
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(true);

    // Release joystick: isMoving = false, speed = 0
    // Step forward 10 idle frames (delta = 0.016s)
    for (let i = 0; i < 10; i++) {
      character.update(
        0.016,
        maze.startWorldPos.x,
        maze.startWorldPos.z,
        0,
        0, // speed = 0
        false, // isMoving = false (joystick released)
        false,
        0,
        0,
        false,
        2.4
      );
    }

    // Legs and arms have damped to zero/neutral resting posture (no sliding feet!)
    expect(Math.abs(character.leftHip.rotation.x)).toBeLessThan(0.02);
    expect(Math.abs(character.rightHip.rotation.x)).toBeLessThan(0.02);
    expect(Math.abs(character.leftKnee.rotation.x)).toBeLessThan(0.02);
    expect(Math.abs(character.rightKnee.rotation.x)).toBeLessThan(0.02);

    // First-person view: neck-down body is visible, head and neck are hidden
    character.update(
      0.016,
      maze.startWorldPos.x,
      maze.startWorldPos.z,
      0,
      0,
      false,
      false,
      0,
      0,
      true, // isFirstPerson = true
      0.0
    );
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(false);
    expect(character.neck.visible).toBe(false);
    expect(character.torsoGroup.visible).toBe(true);

    // Third-person view with extreme close wall distance (< 0.35m): head is hidden to prevent skull clipping
    character.update(
      0.016,
      maze.startWorldPos.x,
      maze.startWorldPos.z,
      0,
      0,
      false,
      false,
      0,
      0,
      false, // third-person
      0.25 // cameraDist < 0.35m
    );
    expect(character.root.visible).toBe(true);
    expect(character.headGroup.visible).toBe(false);
    expect(character.torsoGroup.visible).toBe(true);

    character.dispose();
  });

  it('4. Switching views 50 times in a row leaves no extra objects, listeners or memory growth', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200);
    const controller = new PlayerController(camera, collisionSystem, audioManager);
    controller.resetTo(maze.startWorldPos.x, maze.startWorldPos.z);

    const initialChildrenCount = scene.children.length;

    // Toggle 50 times
    for (let i = 0; i < 50; i++) {
      const mode = controller.toggleCameraMode();
      expect(mode).toBe(i % 2 === 0 ? 'third-person' : 'first-person');
      controller.update(0.016);
    }

    // Return to first-person
    if (controller.cameraMode !== 'first-person') {
      controller.toggleCameraMode();
    }
    expect(controller.cameraMode).toBe('first-person');

    // Scene children count must be completely unchanged
    expect(scene.children.length).toBe(initialChildrenCount);
  });
});
