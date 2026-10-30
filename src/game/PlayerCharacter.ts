/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Procedural Minecraft-style (blocky) full-body player character for Mystic Maze 3D.
 * Built entirely with Three.js primitives and shared PBR materials.
 * Features articulated joint hierarchy, real-time procedural animations,
 * zero per-frame allocations, and seamless 1st/3rd person view modes.
 */
/** One Minecraft "pixel" in metres (32 px tall character ≈ 1.84 m, eyes ≈ 1.66 m). */
const PX_SIZE = 0.0575;
/** Hip height = 12 pixels of leg. */
const PELVIS_Y = 12 * PX_SIZE;

export class PlayerCharacter {
  public root: THREE.Group;

  // Joint Hierarchy
  public pelvis: THREE.Group;
  public spine: THREE.Group;
  public torsoGroup: THREE.Group;
  public neck: THREE.Group;
  public headGroup: THREE.Group;

  // Limbs
  public leftShoulder: THREE.Group;
  public leftElbow: THREE.Group;
  public leftHand: THREE.Group;

  public rightShoulder: THREE.Group;
  public rightElbow: THREE.Group;
  public rightHand: THREE.Group;

  public leftHip: THREE.Group;
  public leftKnee: THREE.Group;
  public leftAnkle: THREE.Group;

  public rightHip: THREE.Group;
  public rightKnee: THREE.Group;
  public rightAnkle: THREE.Group;

  // Shared Materials (reusable across all limbs and components)
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  // Animation State
  private walkPhase = 0;
  private currentYaw = 0;
  private targetYaw = 0;
  private currentSpineLean = 0;
  private isFirstPerson = true;

  // Zero-GC Preallocated Scratch Variables
  private _targetQuat = new THREE.Quaternion();
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'PlayerCharacter';

    // Minecraft-style blocky proportions: 1 "pixel" = PX metres.
    // Head 8x8x8, torso 8x12x4, arms 4x12x4, legs 4x12x4 pixels (total 32 px).
    const PX = PX_SIZE;
    const mat = (color: number, roughness = 0.9) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    const skinMat = mat(0xc99673);
    const hairMat = mat(0x3b2a1a);
    const shirtMat = mat(0x00a8a8); // Steve cyan shirt
    const shirtDarkMat = mat(0x008c8c);
    const pantsMat = mat(0x3c44aa); // Steve blue trousers
    const shoeMat = mat(0x55555a);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeBlueMat = new THREE.MeshBasicMaterial({ color: 0x4b3fb0 });
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7a4a34 });
    this.materials.push(
      skinMat, hairMat, shirtMat, shirtDarkMat, pantsMat, shoeMat, eyeWhiteMat, eyeBlueMat, mouthMat
    );

    const box = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      shadow = true
    ) => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.geometries.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      parent.add(mesh);
      return mesh;
    };

    const LEG_H = 12 * PX;
    const TORSO_H = 12 * PX;
    const LIMB_W = 4 * PX;

    // Pelvis = hip height. Legs hang below it, torso stands on it.
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = PELVIS_Y;
    this.root.add(this.pelvis);

    // Legs (single blocks, shoes as a darker lower band)
    const makeLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * LIMB_W * 0.5, 0, 0);
      this.pelvis.add(hip);
      box(hip, LIMB_W, LEG_H, LIMB_W, pantsMat, 0, -LEG_H / 2, 0);
      box(hip, LIMB_W + 0.006, 3 * PX, LIMB_W + 0.006, shoeMat, 0, -LEG_H + 1.5 * PX, 0.002);
      const knee = new THREE.Group();
      knee.position.y = -LEG_H / 2;
      hip.add(knee);
      const ankle = new THREE.Group();
      ankle.position.y = -LEG_H / 2;
      knee.add(ankle);
      return { hip, knee, ankle };
    };
    const lLeg = makeLeg(-1);
    this.leftHip = lLeg.hip;
    this.leftKnee = lLeg.knee;
    this.leftAnkle = lLeg.ankle;
    const rLeg = makeLeg(1);
    this.rightHip = rLeg.hip;
    this.rightKnee = rLeg.knee;
    this.rightAnkle = rLeg.ankle;

    // Torso
    this.spine = new THREE.Group();
    this.pelvis.add(this.spine);
    this.torsoGroup = new THREE.Group();
    this.spine.add(this.torsoGroup);
    box(this.torsoGroup, 8 * PX, TORSO_H, LIMB_W, shirtMat, 0, TORSO_H / 2, 0);
    // Darker hem at the bottom of the shirt for a bit of definition
    box(this.torsoGroup, 8 * PX + 0.004, PX, LIMB_W + 0.004, shirtDarkMat, 0, PX / 2 + 0.002, 0, false);

    // Arms: sleeve (upper) + bare forearm/hand (lower), elbow bends between them
    const makeArm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (4 * PX + LIMB_W / 2), TORSO_H, 0);
      this.torsoGroup.add(shoulder);
      box(shoulder, LIMB_W, 6 * PX, LIMB_W, shirtMat, 0, -3 * PX, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -6 * PX;
      shoulder.add(elbow);
      box(elbow, LIMB_W, 6 * PX, LIMB_W, skinMat, 0, -3 * PX, 0);
      const hand = new THREE.Group();
      hand.position.y = -6 * PX;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    };
    const lArm = makeArm(-1);
    this.leftShoulder = lArm.shoulder;
    this.leftElbow = lArm.elbow;
    this.leftHand = lArm.hand;
    const rArm = makeArm(1);
    this.rightShoulder = rArm.shoulder;
    this.rightElbow = rArm.elbow;
    this.rightHand = rArm.hand;

    // Neck pivot at top of torso; head sits directly on it (no visible neck in Minecraft)
    this.neck = new THREE.Group();
    this.neck.position.y = TORSO_H;
    this.torsoGroup.add(this.neck);
    this.headGroup = new THREE.Group();
    this.neck.add(this.headGroup);

    const H = 8 * PX;
    box(this.headGroup, H, H, H, skinMat, 0, H / 2, 0);

    // Hair: top cap, back, sides and a fringe over the forehead
    const e = 0.006;
    box(this.headGroup, H + e, 2 * PX, H + e, hairMat, 0, H - PX, 0);
    box(this.headGroup, H + e, 6 * PX, PX, hairMat, 0, H - 3 * PX, -H / 2 + PX / 2);
    box(this.headGroup, PX, 4 * PX, H - 2 * PX, hairMat, -H / 2 + PX / 2, H - 4 * PX, PX * 0.5 - 0.0);
    box(this.headGroup, PX, 4 * PX, H - 2 * PX, hairMat, H / 2 - PX / 2, H - 4 * PX, PX * 0.5 - 0.0);
    box(this.headGroup, H + e, PX, PX, hairMat, 0, H - 1.5 * PX, H / 2 - PX / 2 + 0.001);

    // Face (flat pixel details on the +Z front)
    const fz = H / 2 + 0.003;
    const eyeY = 2.5 * PX;
    for (const s of [-1, 1]) {
      box(this.headGroup, PX, PX, 0.004, eyeWhiteMat, s * 2.5 * PX, eyeY, fz, false);
      box(this.headGroup, PX, PX, 0.005, eyeBlueMat, s * 1.5 * PX, eyeY, fz, false);
    }
    box(this.headGroup, 2 * PX, PX * 0.6, 0.004, mouthMat, 0, 1.0 * PX, fz, false); // mouth
    box(this.headGroup, 2 * PX, PX * 0.6, 0.004, mouthMat, 0, 1.8 * PX, fz, false); // nose
  }

  /**
   * Updates character transforms, limb kinematics, and animations.
   * Completely allocation-free in render loop.
   */
  public update(
    delta: number,
    worldX: number,
    worldZ: number,
    cameraYaw: number,
    speed: number,
    isMoving: boolean,
    isSprinting: boolean,
    moveDirX: number,
    moveDirZ: number,
    isFirstPerson: boolean,
    cameraDist = 2.4,
    forwardSwingLimit = 1.0
  ) {
    this.isFirstPerson = isFirstPerson;

    // 1. Position character root at ground plane directly under player
    this.root.position.set(worldX, 0, worldZ);

    // 2. View Mode Visibility Control
    // First-person: The player sees their own body (torso, arms, hands, legs, feet) when looking down or forward.
    // The head and hair are hidden so they never block the camera. The neck is hidden so the collar cleanly caps the chest.
    // Third-person: Full body is visible. When camera retracts extremely close (< 0.35m) in tight corners,
    // head is safely hidden to avoid near-plane geometry clipping.
    this.root.visible = true;
    this.torsoGroup.visible = true;
    this.pelvis.visible = true;

    if (isFirstPerson) {
      this.headGroup.visible = false;
      this.neck.visible = false;
    } else {
      this.headGroup.visible = cameraDist >= 0.35;
      this.neck.visible = true;
    }

    // 3. Character Yaw Orientation
    // Note: The character model's local +Z is front (eyes, nose, mouth, chest, toes).
    // The player's forward direction is (-sin(cameraYaw), -cos(cameraYaw)).
    // Therefore, to face forward, the model rotation is cameraYaw + Math.PI.
    if (isFirstPerson) {
      // In 1st-person, character root strictly faces forward along camera look vector
      this.currentYaw = cameraYaw + Math.PI;
      this.root.rotation.y = this.currentYaw;
    } else {
      // In 3rd-person, character smoothly turns to face travel direction when moving,
      // or faces camera forward direction when stationary (matching atan2 forward angle).
      if (isMoving && (Math.abs(moveDirX) > 0.01 || Math.abs(moveDirZ) > 0.01)) {
        this.targetYaw = Math.atan2(moveDirX, moveDirZ);
      } else {
        this.targetYaw = cameraYaw + Math.PI;
      }

      // Smooth angle interpolation handling wrap-around
      let diff = this.targetYaw - this.currentYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.currentYaw += diff * Math.min(1.0, delta * 12.0);
      this.root.rotation.y = this.currentYaw;
    }

    // 4. Procedural Kinematics: Walk / Sprint / Idle
    if (isMoving && speed > 0.1) {
      // Advance walk phase synchronized with real movement speed and stride length
      const strideCadence = isSprinting ? 12.0 : 8.5;
      this.walkPhase += delta * strideCadence;

      // Leg swing angles (scaled by forwardSwingLimit so feet never clip into walls when near)
      const maxLegAngle = (isSprinting ? 0.65 : 0.45) * forwardSwingLimit;
      const legSin = Math.sin(this.walkPhase);

      // Thighs swing opposite to each other
      this.leftHip.rotation.x = legSin * maxLegAngle;
      this.rightHip.rotation.x = -legSin * maxLegAngle;

      // Knees bend backward when thigh swings back (natural human gait)
      const maxKneeFlex = (isSprinting ? 0.85 : 0.60) * forwardSwingLimit;
      this.leftKnee.rotation.x = Math.max(0, -legSin) * maxKneeFlex;
      this.rightKnee.rotation.x = Math.max(0, legSin) * maxKneeFlex;

      // Ankles flex to keep foot level
      this.leftAnkle.rotation.x = -this.leftHip.rotation.x * 0.4;
      this.rightAnkle.rotation.x = -this.rightHip.rotation.x * 0.4;

      // Arms swing opposite to corresponding leg (scaled by forwardSwingLimit so hands never clip walls)
      const maxArmAngle = (isSprinting ? 0.72 : 0.50) * forwardSwingLimit;
      this.leftShoulder.rotation.x = -legSin * maxArmAngle;
      this.rightShoulder.rotation.x = legSin * maxArmAngle;

      // Natural running arm mechanics:
      // When swinging forward, elbow flexes up to ~75-80 deg (-1.25 rad in sprint, -1.0 rad in walk),
      // bringing forearm and hand forward and upward into the lower edge of the first-person screen.
      // When swinging back, elbow extends naturally (-0.22 rad).
      const elbowForwardFlex = isSprinting ? 1.05 : 0.85;
      this.leftElbow.rotation.x = -0.22 - Math.max(0, -legSin) * elbowForwardFlex * forwardSwingLimit;
      this.rightElbow.rotation.x = -0.22 - Math.max(0, legSin) * elbowForwardFlex * forwardSwingLimit;

      // Slight natural arm adduction across torso on forward swing
      this.leftShoulder.rotation.y = Math.max(0, -legSin) * 0.18;
      this.rightShoulder.rotation.y = -Math.max(0, legSin) * 0.18;

      // Slight natural shoulder abduction
      this.leftShoulder.rotation.z = -0.08;
      this.rightShoulder.rotation.z = 0.08;

      // Pelvis subtle vertical bounce & sway
      const bounce = Math.abs(Math.sin(this.walkPhase)) * (isSprinting ? 0.05 : 0.03);
      this.pelvis.position.y = PELVIS_Y - bounce;
      this.pelvis.rotation.y = legSin * 0.06;

      // Sprint Forward Torso Lean
      const targetLean = isSprinting ? 0.22 : 0.06;
      this.currentSpineLean = THREE.MathUtils.damp(this.currentSpineLean, targetLean, 10, delta);
      this.spine.rotation.x = this.currentSpineLean;
    } else {
      // IDLE STATE: Zero sliding feet! Immediately return limbs to resting stance
      const dampSpeed = 16.0;
      this.leftHip.rotation.x = THREE.MathUtils.damp(this.leftHip.rotation.x, 0, dampSpeed, delta);
      this.rightHip.rotation.x = THREE.MathUtils.damp(this.rightHip.rotation.x, 0, dampSpeed, delta);
      this.leftKnee.rotation.x = THREE.MathUtils.damp(this.leftKnee.rotation.x, 0, dampSpeed, delta);
      this.rightKnee.rotation.x = THREE.MathUtils.damp(this.rightKnee.rotation.x, 0, dampSpeed, delta);
      this.leftAnkle.rotation.x = THREE.MathUtils.damp(this.leftAnkle.rotation.x, 0, dampSpeed, delta);
      this.rightAnkle.rotation.x = THREE.MathUtils.damp(this.rightAnkle.rotation.x, 0, dampSpeed, delta);

      // Relax arms to natural resting posture beside hips
      this.leftShoulder.rotation.x = THREE.MathUtils.damp(this.leftShoulder.rotation.x, 0.05, dampSpeed, delta);
      this.rightShoulder.rotation.x = THREE.MathUtils.damp(this.rightShoulder.rotation.x, 0.05, dampSpeed, delta);
      this.leftShoulder.rotation.y = THREE.MathUtils.damp(this.leftShoulder.rotation.y, 0, dampSpeed, delta);
      this.rightShoulder.rotation.y = THREE.MathUtils.damp(this.rightShoulder.rotation.y, 0, dampSpeed, delta);
      this.leftShoulder.rotation.z = THREE.MathUtils.damp(this.leftShoulder.rotation.z, -0.06, dampSpeed, delta);
      this.rightShoulder.rotation.z = THREE.MathUtils.damp(this.rightShoulder.rotation.z, 0.06, dampSpeed, delta);
      this.leftElbow.rotation.x = THREE.MathUtils.damp(this.leftElbow.rotation.x, -0.15, dampSpeed, delta);
      this.rightElbow.rotation.x = THREE.MathUtils.damp(this.rightElbow.rotation.x, -0.15, dampSpeed, delta);

      this.currentSpineLean = THREE.MathUtils.damp(this.currentSpineLean, 0, dampSpeed, delta);
      this.pelvis.position.y = THREE.MathUtils.damp(this.pelvis.position.y, PELVIS_Y, dampSpeed, delta);
      this.pelvis.rotation.y = THREE.MathUtils.damp(this.pelvis.rotation.y, 0, dampSpeed, delta);

      // Subtle breathing motion on torso
      const idleTime = performance.now() * 0.002;
      const breath = Math.sin(idleTime) * 0.015;
      this.spine.rotation.x = this.currentSpineLean + breath;
      this.neck.rotation.x = -breath * 0.5;
    }
  }

  /**
   * Disposes all procedural geometries and shared materials cleanly.
   */
  public dispose() {
    for (const geo of this.geometries) {
      geo.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    this.geometries = [];
    this.materials = [];
  }
}
