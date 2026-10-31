/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { CollisionSystem } from './CollisionSystem';
import { AudioManager } from './AudioManager';

export interface PlayerInput {
  moveX: number; // -1 to 1 (strafe)
  moveZ: number; // -1 to 1 (forward/backward)
  lookDeltaX: number;
  lookDeltaY: number;
  isSprinting: boolean;
}

export class PlayerController {
  private camera: THREE.PerspectiveCamera;
  private collisionSystem: CollisionSystem;
  private audioManager: AudioManager;

  // Position & rotation
  public position: THREE.Vector3 = new THREE.Vector3();
  public rotationYaw = 0;   // Horizontal angle (radians)
  public rotationPitch = 0; // Vertical angle (radians)

  // Physical stats
  private readonly eyeHeight = 1.66;
  private readonly walkSpeed = 4.2;
  private readonly sprintSpeed = 7.0;

  // Camera & View Mode
  public cameraMode: 'first-person' | 'third-person' = 'first-person';
  public cameraTransitionProgress = 0; // 0 = first-person, 1 = third-person
  public thirdPersonDistance = 2.4;
  public targetThirdPersonDist = 2.4;
  public maxCameraHeight = 3.3; // Strictly clamped to stay well below maze walls

  // Zero-GC Preallocated Math Helpers
  private _fpCamPos = new THREE.Vector3();
  private _tpCamPos = new THREE.Vector3();
  private _fpQuat = new THREE.Quaternion();
  private _tpQuat = new THREE.Quaternion();
  private _fpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private _tpMatrix = new THREE.Matrix4();
  private _tempFocus = new THREE.Vector3();
  private _upVector = new THREE.Vector3(0, 1, 0);

  // Real movement state for character kinematics
  public isMoving = false;
  public currentSpeed = 0;
  public moveWorldDirX = 0;
  public moveWorldDirZ = 0;
  public forwardSwingLimit = 1.0;

  // Head bobbing (calm motion, zero nausea)
  private bobCycle = 0;
  private headBobAmount = 0.03;

  // Run statistics
  public stepsTaken = 0;
  public distanceTraveled = 0;
  private lastStepDist = 0;

  // Input states
  public currentInput: PlayerInput = {
    moveX: 0,
    moveZ: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    isSprinting: false,
  };

  // Sensitivity & settings
  public lookSensitivity = 1.0;
  public invertY = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    collisionSystem: CollisionSystem,
    audioManager: AudioManager
  ) {
    this.camera = camera;
    this.collisionSystem = collisionSystem;
    this.audioManager = audioManager;
  }

  /**
   * Resets player position to starting world position
   */
  public resetTo(x: number, z: number, facingAngle?: number) {
    this.position.set(x, this.eyeHeight, z);
    this.rotationYaw = facingAngle !== undefined ? facingAngle : Math.atan2(x, z); // Face towards center (forward = (-sin yaw, -cos yaw))
    this.rotationPitch = 0;
    this.stepsTaken = 0;
    this.distanceTraveled = 0;
    this.lastStepDist = 0;
    this.bobCycle = 0;

    this.updateCameraTransform(0, 0);
  }

  /**
   * Updates player movement, collision resolution, and camera orientation
   */
  public update(delta: number) {
    // 1. Process Look Rotation
    const sensMultiplier = 0.0022 * this.lookSensitivity;
    this.rotationYaw -= this.currentInput.lookDeltaX * sensMultiplier;

    const yFactor = this.invertY ? 1 : -1;
    this.rotationPitch += this.currentInput.lookDeltaY * sensMultiplier * yFactor;

    // Sensible vertical look limits:
    // First-person: -75 deg to +75 deg (-1.3 to +1.3 rad)
    // Third-person: -34 deg to +26 deg (-0.6 to +0.45 rad) - prevents looking under floor or over maze walls
    const minPitch = this.cameraMode === 'third-person' ? -0.6 : -1.3;
    const maxPitch = this.cameraMode === 'third-person' ? 0.45 : 1.3;
    this.rotationPitch = Math.max(minPitch, Math.min(maxPitch, this.rotationPitch));

    // Reset single-frame look delta
    this.currentInput.lookDeltaX = 0;
    this.currentInput.lookDeltaY = 0;

    // 2. Process Movement Vector
    const moveX = this.currentInput.moveX;
    const moveZ = this.currentInput.moveZ;
    const inputMagnitude = Math.hypot(moveX, moveZ);

    this.isMoving = false;
    this.currentSpeed = 0;
    let frameDist = 0;

    if (inputMagnitude > 0.05) {
      this.isMoving = true;
      // Normalize direction so diagonal isn't faster
      const normX = moveX / Math.max(1, inputMagnitude);
      const normZ = moveZ / Math.max(1, inputMagnitude);

      const speed = this.currentInput.isSprinting ? this.sprintSpeed : this.walkSpeed;
      this.currentSpeed = speed;
      const moveDistance = speed * delta;

      // Transform relative input into world space based on camera yaw
      // Controls rotate camera around character; movement direction stays relative to camera
      const forwardX = -Math.sin(this.rotationYaw);
      const forwardZ = -Math.cos(this.rotationYaw);
      const rightX = Math.cos(this.rotationYaw);
      const rightZ = -Math.sin(this.rotationYaw);

      const desiredDirX = forwardX * normZ + rightX * normX;
      const desiredDirZ = forwardZ * normZ + rightZ * normX;

      this.moveWorldDirX = desiredDirX;
      this.moveWorldDirZ = desiredDirZ;

      // 3. Wall Collision Resolution with Movement Sub-Stepping
      const stepCount = Math.max(1, Math.ceil(moveDistance / 0.10));
      const stepDist = moveDistance / stepCount;

      let currentX = this.position.x;
      let currentZ = this.position.z;
      let totalDistMoved = 0;

      for (let s = 0; s < stepCount; s++) {
        const stepTargetX = currentX + desiredDirX * stepDist;
        const stepTargetZ = currentZ + desiredDirZ * stepDist;

        const resolved = this.collisionSystem.resolvePosition(stepTargetX, stepTargetZ);
        const subDist = Math.hypot(resolved.x - currentX, resolved.z - currentZ);
        totalDistMoved += subDist;

        currentX = resolved.x;
        currentZ = resolved.z;
      }

      frameDist = totalDistMoved;
      this.position.x = currentX;
      this.position.z = currentZ;

      this.distanceTraveled += frameDist;

      // Footstep triggering & step counting
      if (frameDist > 0.001) {
        this.lastStepDist += frameDist;
        const stepThreshold = this.currentInput.isSprinting ? 1.6 : 1.3;
        if (this.lastStepDist >= stepThreshold) {
          this.stepsTaken++;
          this.lastStepDist = 0;
          this.audioManager.playFootstep(this.currentInput.isSprinting);
        }
      }

      // Dynamic forward clearance probe for limb collision scaling:
      // When approaching or running against a wall, limit limb swing so arms and legs never pierce the wall.
      const probeRes = this.collisionSystem.resolvePosition(
        this.position.x + desiredDirX * 0.48,
        this.position.z + desiredDirZ * 0.48
      );
      if (probeRes.collided) {
        const freeDist = Math.hypot(probeRes.x - this.position.x, probeRes.z - this.position.z);
        const clearanceRatio = Math.max(0.3, Math.min(1.0, freeDist / 0.45));
        const moveRatio = moveDistance > 0.001 ? Math.min(1.0, frameDist / moveDistance) : 1.0;
        this.forwardSwingLimit = Math.min(clearanceRatio, moveRatio < 0.2 ? 0.35 : 1.0);
      } else {
        this.forwardSwingLimit = 1.0;
      }
    } else {
      this.moveWorldDirX = 0;
      this.moveWorldDirZ = 0;
      this.forwardSwingLimit = 1.0;
    }

    // 4. Head bob animation
    if (this.isMoving && frameDist > 0.005) {
      const bobSpeed = this.currentInput.isSprinting ? 16 : 11;
      this.bobCycle += delta * bobSpeed;
    } else {
      // Ease bob cycle smoothly back to zero
      this.bobCycle = THREE.MathUtils.damp(this.bobCycle, Math.round(this.bobCycle / (Math.PI * 2)) * Math.PI * 2, 8, delta);
    }

    // Third-person camera distance: instantly retract on wall occlusion to prevent 1-frame wall clipping, smoothly expand when clear
    if (this.targetThirdPersonDist < this.thirdPersonDistance) {
      this.thirdPersonDistance = this.targetThirdPersonDist;
    } else {
      this.thirdPersonDistance = THREE.MathUtils.damp(this.thirdPersonDistance, this.targetThirdPersonDist, 10, delta);
    }

    this.updateCameraTransform(delta, this.bobCycle);
  }

  /**
   * Focal point elevation on the character's mid-body/center of mass (1.15m above ground)
   */
  public get cameraFocusY(): number {
    const groundY = this.position.y - this.eyeHeight;
    return groundY + 1.15;
  }

  /**
   * Toggles between first-person and third-person perspectives
   */
  public toggleCameraMode(): 'first-person' | 'third-person' {
    this.cameraMode = this.cameraMode === 'first-person' ? 'third-person' : 'first-person';
    return this.cameraMode;
  }

  /**
   * Explicitly sets the camera perspective mode
   */
  public setCameraMode(mode: 'first-person' | 'third-person') {
    this.cameraMode = mode;
  }

  /**
   * Applies yaw, pitch, and position with smooth perspective blending to Three.js camera
   */
  private updateCameraTransform(delta: number, bobCycle: number) {
    // 1. Calculate First-Person camera position and orientation
    const bobOffset = Math.sin(bobCycle) * this.headBobAmount;
    const swayOffset = Math.cos(bobCycle * 0.5) * (this.headBobAmount * 0.5);

    // Anatomical eye offset: eyes sit 0.06m forward along character forward axis from spine
    const forwardX = -Math.sin(this.rotationYaw);
    const forwardZ = -Math.cos(this.rotationYaw);

    this._fpCamPos.set(
      this.position.x + forwardX * 0.06 + Math.cos(this.rotationYaw) * swayOffset,
      this.eyeHeight + bobOffset,
      this.position.z + forwardZ * 0.06 - Math.sin(this.rotationYaw) * swayOffset
    );

    this._fpEuler.set(this.rotationPitch, this.rotationYaw, 0, 'YXZ');
    this._fpQuat.setFromEuler(this._fpEuler);

    // 2. Calculate Third-Person camera position and orientation
    const effectiveDist = Math.max(0.22, this.thirdPersonDistance);
    const tpPitch = Math.max(-0.6, Math.min(0.45, this.rotationPitch));
    const cosPitch = Math.cos(tpPitch);
    const sinPitch = Math.sin(tpPitch);

    // Offset camera behind and slightly above character
    const offsetX = Math.sin(this.rotationYaw) * (cosPitch * effectiveDist);
    const offsetZ = Math.cos(this.rotationYaw) * (cosPitch * effectiveDist);
    // Positive pitch = looking up, so the orbiting camera swings BELOW the focus point (swipe up -> look up)
    const offsetY = -sinPitch * effectiveDist;

    const focusY = this.cameraFocusY; // Mid-torso center at y = 1.15m
    const rawCamY = focusY + 0.35 + offsetY;
    // Strict vertical clamping: minimum 0.45m (never under floor), maximum maxCameraHeight (never over walls)
    const clampedCamY = Math.max(0.45, Math.min(this.maxCameraHeight, rawCamY));

    this._tpCamPos.set(
      this.position.x + offsetX,
      clampedCamY,
      this.position.z + offsetZ
    );

    this._tempFocus.set(this.position.x, focusY, this.position.z);
    this._tpMatrix.lookAt(this._tpCamPos, this._tempFocus, this._upVector);
    this._tpQuat.setFromRotationMatrix(this._tpMatrix);

    // 3. Smooth Camera Mode Transition (damp progress 0 -> 1 or 1 -> 0)
    const targetProgress = this.cameraMode === 'first-person' ? 0.0 : 1.0;
    if (delta > 0) {
      this.cameraTransitionProgress = THREE.MathUtils.damp(
        this.cameraTransitionProgress,
        targetProgress,
        14,
        delta
      );
      // Ensure transition always cleanly finishes and never leaves camera between 1st and 3rd person
      if (Math.abs(this.cameraTransitionProgress - targetProgress) < 0.005) {
        this.cameraTransitionProgress = targetProgress;
      }
    } else {
      this.cameraTransitionProgress = targetProgress;
    }

    // 4. Apply blended position and orientation to camera
    if (this.cameraTransitionProgress <= 0.0) {
      this.cameraTransitionProgress = 0.0;
      this.camera.position.copy(this._fpCamPos);
      this.camera.quaternion.copy(this._fpQuat);
    } else if (this.cameraTransitionProgress >= 1.0) {
      this.cameraTransitionProgress = 1.0;
      this.camera.position.copy(this._tpCamPos);
      this.camera.quaternion.copy(this._tpQuat);
    } else {
      this.camera.position.lerpVectors(this._fpCamPos, this._tpCamPos, this.cameraTransitionProgress);
      this.camera.quaternion.slerpQuaternions(this._fpQuat, this._tpQuat, this.cameraTransitionProgress);
    }
  }
}
