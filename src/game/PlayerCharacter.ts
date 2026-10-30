/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Procedural full-body human player character for Mystic Maze 3D.
 * Built entirely with Three.js primitives and shared PBR materials.
 * Features articulated joint hierarchy, real-time procedural animations,
 * zero per-frame allocations, and seamless 1st/3rd person view modes.
 */
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

    // 1. Build Shared Materials
    const navyJacketMat = new THREE.MeshStandardMaterial({
      color: 0x162238, // Dark navy fitted jacket
      roughness: 0.85,
      metalness: 0.1,
    });
    const lavenderTrimMat = new THREE.MeshStandardMaterial({
      color: 0xc084fc, // Lavender mystical trim
      roughness: 0.5,
      metalness: 0.15,
    });
    const trousersMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Dark stone gray trousers
      roughness: 0.9,
      metalness: 0.05,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x241d18, // Dark leather boots & gloves
      roughness: 0.7,
      metalness: 0.1,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xdfac87, // Natural warm explorer skin tone
      roughness: 0.65,
      metalness: 0.0,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x181628, // Deep espresso/indigo hair
      roughness: 0.85,
      metalness: 0.05,
    });
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0x5b47a0, // Rich violet scarf/short cape
      roughness: 0.8,
      metalness: 0.05,
    });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4, // Cyan rune
      emissive: 0x00f0ff,
      emissiveIntensity: 0.35, // Faint glow without illuminating maze walls
      roughness: 0.3,
      metalness: 0.1,
    });
    const eyePupilMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a, // Deep pupil
    });
    const eyeHighlightMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Faint cyan specular reflection
    });

    this.materials.push(
      navyJacketMat,
      lavenderTrimMat,
      trousersMat,
      leatherMat,
      skinMat,
      hairMat,
      scarfMat,
      runeMat,
      eyePupilMat,
      eyeHighlightMat
    );

    // 2. Build Procedural Geometries
    // Pelvis
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.95; // Hips at y = 0.95m
    this.root.add(this.pelvis);

    const pelvisGeo = new THREE.BoxGeometry(0.30, 0.16, 0.20);
    this.geometries.push(pelvisGeo);
    const pelvisMesh = new THREE.Mesh(pelvisGeo, trousersMat);
    pelvisMesh.castShadow = true;
    pelvisMesh.receiveShadow = true;
    this.pelvis.add(pelvisMesh);

    // Belt
    const beltGeo = new THREE.BoxGeometry(0.31, 0.04, 0.21);
    this.geometries.push(beltGeo);
    const beltMesh = new THREE.Mesh(beltGeo, leatherMat);
    beltMesh.position.y = 0.06;
    this.pelvis.add(beltMesh);

    // 3. Lower Limbs (Hips -> Thighs -> Knees -> Shins -> Ankles -> Boots)
    const thighGeo = new THREE.CylinderGeometry(0.08, 0.062, 0.44, 8);
    const kneeCapGeo = new THREE.SphereGeometry(0.064, 6, 6);
    const shinGeo = new THREE.CylinderGeometry(0.062, 0.054, 0.40, 8);
    const bootFootGeo = new THREE.BoxGeometry(0.11, 0.08, 0.22);
    const bootToeGeo = new THREE.BoxGeometry(0.108, 0.065, 0.06);
    this.geometries.push(thighGeo, kneeCapGeo, shinGeo, bootFootGeo, bootToeGeo);

    // Left Leg
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.13, -0.06, 0);
    this.pelvis.add(this.leftHip);

    const leftThighMesh = new THREE.Mesh(thighGeo, trousersMat);
    leftThighMesh.position.y = -0.22;
    leftThighMesh.castShadow = true;
    this.leftHip.add(leftThighMesh);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.y = -0.44; // Knee joint at y = 0.45m
    this.leftHip.add(this.leftKnee);

    const leftKneeCap = new THREE.Mesh(kneeCapGeo, trousersMat);
    this.leftKnee.add(leftKneeCap);

    const leftShinMesh = new THREE.Mesh(shinGeo, trousersMat);
    leftShinMesh.position.y = -0.20;
    leftShinMesh.castShadow = true;
    this.leftKnee.add(leftShinMesh);

    this.leftAnkle = new THREE.Group();
    this.leftAnkle.position.y = -0.40; // Ankle joint at y = 0.05m
    this.leftKnee.add(this.leftAnkle);

    const leftFootMesh = new THREE.Mesh(bootFootGeo, leatherMat);
    leftFootMesh.position.set(0, -0.035, 0.04);
    leftFootMesh.castShadow = true;
    this.leftAnkle.add(leftFootMesh);

    const leftToeMesh = new THREE.Mesh(bootToeGeo, leatherMat);
    leftToeMesh.position.set(0, -0.042, 0.16);
    this.leftAnkle.add(leftToeMesh);

    // Right Leg
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.13, -0.06, 0);
    this.pelvis.add(this.rightHip);

    const rightThighMesh = new THREE.Mesh(thighGeo, trousersMat);
    rightThighMesh.position.y = -0.22;
    rightThighMesh.castShadow = true;
    this.rightHip.add(rightThighMesh);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.y = -0.44;
    this.rightHip.add(this.rightKnee);

    const rightKneeCap = new THREE.Mesh(kneeCapGeo, trousersMat);
    this.rightKnee.add(rightKneeCap);

    const rightShinMesh = new THREE.Mesh(shinGeo, trousersMat);
    rightShinMesh.position.y = -0.20;
    rightShinMesh.castShadow = true;
    this.rightKnee.add(rightShinMesh);

    this.rightAnkle = new THREE.Group();
    this.rightAnkle.position.y = -0.40;
    this.rightKnee.add(this.rightAnkle);

    const rightFootMesh = new THREE.Mesh(bootFootGeo, leatherMat);
    rightFootMesh.position.set(0, -0.035, 0.04);
    rightFootMesh.castShadow = true;
    this.rightAnkle.add(rightFootMesh);

    const rightToeMesh = new THREE.Mesh(bootToeGeo, leatherMat);
    rightToeMesh.position.set(0, -0.042, 0.16);
    this.rightAnkle.add(rightToeMesh);

    // 4. Spine & Torso Group
    this.spine = new THREE.Group();
    this.spine.position.y = 0.08;
    this.pelvis.add(this.spine);

    this.torsoGroup = new THREE.Group();
    this.spine.add(this.torsoGroup);

    // Waist / Lower Jacket
    const waistGeo = new THREE.BoxGeometry(0.31, 0.18, 0.205);
    this.geometries.push(waistGeo);
    const waistMesh = new THREE.Mesh(waistGeo, navyJacketMat);
    waistMesh.position.y = 0.09;
    waistMesh.castShadow = true;
    this.torsoGroup.add(waistMesh);

    // Chest / Upper Jacket
    const chestGeo = new THREE.BoxGeometry(0.35, 0.28, 0.22);
    this.geometries.push(chestGeo);
    const chestMesh = new THREE.Mesh(chestGeo, navyJacketMat);
    chestMesh.position.y = 0.31;
    chestMesh.castShadow = true;
    this.torsoGroup.add(chestMesh);

    // Lavender Front Seam & Collar Trim
    const trimFrontGeo = new THREE.BoxGeometry(0.025, 0.44, 0.015);
    this.geometries.push(trimFrontGeo);
    const trimFrontMesh = new THREE.Mesh(trimFrontGeo, lavenderTrimMat);
    trimFrontMesh.position.set(0, 0.22, 0.112);
    this.torsoGroup.add(trimFrontMesh);

    const collarGeo = new THREE.BoxGeometry(0.18, 0.06, 0.18);
    this.geometries.push(collarGeo);
    const collarMesh = new THREE.Mesh(collarGeo, lavenderTrimMat);
    collarMesh.position.set(0, 0.44, 0.01);
    this.torsoGroup.add(collarMesh);

    // Short Cape / Scarf (Draped on upper back, ends mid-torso - does not cover arms/legs)
    const scarfWrapGeo = new THREE.TorusGeometry(0.11, 0.035, 6, 12);
    this.geometries.push(scarfWrapGeo);
    const scarfWrapMesh = new THREE.Mesh(scarfWrapGeo, scarfMat);
    scarfWrapMesh.rotation.x = Math.PI * 0.5;
    scarfWrapMesh.position.set(0, 0.44, 0.02);
    this.torsoGroup.add(scarfWrapMesh);

    const shortCapeGeo = new THREE.BoxGeometry(0.24, 0.22, 0.02);
    this.geometries.push(shortCapeGeo);
    const shortCapeMesh = new THREE.Mesh(shortCapeGeo, scarfMat);
    shortCapeMesh.position.set(0, 0.30, -0.125);
    shortCapeMesh.rotation.x = -0.08; // Gentle drape
    this.torsoGroup.add(shortCapeMesh);

    // Faint Glowing Cyan Rune on Back of Jacket
    const runeDiamondGeo = new THREE.BoxGeometry(0.08, 0.08, 0.012);
    this.geometries.push(runeDiamondGeo);
    const runeMesh = new THREE.Mesh(runeDiamondGeo, runeMat);
    runeMesh.position.set(0, 0.32, -0.138);
    runeMesh.rotation.z = Math.PI * 0.25; // Diamond orientation
    this.torsoGroup.add(runeMesh);

    const runeInnerDotGeo = new THREE.BoxGeometry(0.03, 0.03, 0.015);
    this.geometries.push(runeInnerDotGeo);
    const runeInnerDotMesh = new THREE.Mesh(runeInnerDotGeo, lavenderTrimMat);
    runeInnerDotMesh.position.set(0, 0.32, -0.14);
    this.torsoGroup.add(runeInnerDotMesh);

    // 5. Neck & Articulated Head
    this.neck = new THREE.Group();
    this.neck.position.y = 0.46; // Neck pivot
    this.torsoGroup.add(this.neck);

    const neckGeo = new THREE.CylinderGeometry(0.062, 0.07, 0.08, 8);
    this.geometries.push(neckGeo);
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.position.y = 0.04;
    this.neck.add(neckMesh);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.08; // Head joint
    this.neck.add(this.headGroup);

    // Cranium & Jaw (Head center ~ y = 1.65m matching player eye level)
    const headBaseGeo = new THREE.BoxGeometry(0.18, 0.20, 0.19);
    this.geometries.push(headBaseGeo);
    const headBaseMesh = new THREE.Mesh(headBaseGeo, skinMat);
    headBaseMesh.position.set(0, 0.10, 0.01);
    headBaseMesh.castShadow = true;
    this.headGroup.add(headBaseMesh);

    // Hair: Top volume & bangs
    const hairTopGeo = new THREE.BoxGeometry(0.20, 0.09, 0.21);
    const hairBackGeo = new THREE.BoxGeometry(0.19, 0.14, 0.09);
    const hairBangsGeo = new THREE.BoxGeometry(0.18, 0.06, 0.05);
    this.geometries.push(hairTopGeo, hairBackGeo, hairBangsGeo);

    const hairTop = new THREE.Mesh(hairTopGeo, hairMat);
    hairTop.position.set(0, 0.18, 0.01);
    this.headGroup.add(hairTop);

    const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
    hairBack.position.set(0, 0.11, -0.07);
    this.headGroup.add(hairBack);

    const hairBangs = new THREE.Mesh(hairBangsGeo, hairMat);
    hairBangs.position.set(0.01, 0.155, 0.095);
    hairBangs.rotation.z = -0.08;
    this.headGroup.add(hairBangs);

    // Face Features: Eyes, Nose, Mouth
    // Eyes: Eye level is at y = 0.11 within headGroup -> World y = 0.95 + 0.08 + 0.46 + 0.08 + 0.11 = 1.68m
    const eyeGeo = new THREE.BoxGeometry(0.032, 0.018, 0.02);
    const eyeGlintGeo = new THREE.BoxGeometry(0.01, 0.01, 0.022);
    const noseGeo = new THREE.BoxGeometry(0.024, 0.042, 0.03);
    const mouthGeo = new THREE.BoxGeometry(0.048, 0.012, 0.012);
    this.geometries.push(eyeGeo, eyeGlintGeo, noseGeo, mouthGeo);

    // Left Eye & Pupil
    const leftEyeMesh = new THREE.Mesh(eyeGeo, eyePupilMat);
    leftEyeMesh.position.set(-0.048, 0.11, 0.102);
    this.headGroup.add(leftEyeMesh);
    const leftGlintMesh = new THREE.Mesh(eyeGlintGeo, eyeHighlightMat);
    leftGlintMesh.position.set(-0.044, 0.114, 0.104);
    this.headGroup.add(leftGlintMesh);

    // Right Eye & Pupil
    const rightEyeMesh = new THREE.Mesh(eyeGeo, eyePupilMat);
    rightEyeMesh.position.set(0.048, 0.11, 0.102);
    this.headGroup.add(rightEyeMesh);
    const rightGlintMesh = new THREE.Mesh(eyeGlintGeo, eyeHighlightMat);
    rightGlintMesh.position.set(0.052, 0.114, 0.104);
    this.headGroup.add(rightGlintMesh);

    // Nose
    const noseMesh = new THREE.Mesh(noseGeo, skinMat);
    noseMesh.position.set(0, 0.078, 0.112);
    this.headGroup.add(noseMesh);

    // Mouth
    const mouthMesh = new THREE.Mesh(mouthGeo, eyePupilMat);
    mouthMesh.position.set(0, 0.035, 0.104);
    this.headGroup.add(mouthMesh);

    // 6. Upper Limbs (Shoulders -> Upper Arms -> Elbows -> Forearms -> Hands)
    const upperArmGeo = new THREE.CylinderGeometry(0.054, 0.048, 0.26, 8);
    const shoulderCapGeo = new THREE.SphereGeometry(0.056, 6, 6);
    const forearmGeo = new THREE.CylinderGeometry(0.048, 0.042, 0.25, 8);
    const handGeo = new THREE.BoxGeometry(0.065, 0.09, 0.045);
    const thumbGeo = new THREE.BoxGeometry(0.024, 0.04, 0.026);
    this.geometries.push(upperArmGeo, shoulderCapGeo, forearmGeo, handGeo, thumbGeo);

    // Left Arm
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.22, 0.41, 0);
    this.torsoGroup.add(this.leftShoulder);

    const leftShoulderCap = new THREE.Mesh(shoulderCapGeo, navyJacketMat);
    this.leftShoulder.add(leftShoulderCap);

    const leftUpperArmMesh = new THREE.Mesh(upperArmGeo, navyJacketMat);
    leftUpperArmMesh.position.y = -0.13;
    leftUpperArmMesh.castShadow = true;
    this.leftShoulder.add(leftUpperArmMesh);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.y = -0.26;
    this.leftShoulder.add(this.leftElbow);

    const leftForearmMesh = new THREE.Mesh(forearmGeo, leatherMat);
    leftForearmMesh.position.y = -0.125;
    leftForearmMesh.castShadow = true;
    this.leftElbow.add(leftForearmMesh);

    this.leftHand = new THREE.Group();
    this.leftHand.position.y = -0.25;
    this.leftElbow.add(this.leftHand);

    const leftHandMesh = new THREE.Mesh(handGeo, leatherMat);
    leftHandMesh.position.set(0, -0.04, 0);
    leftHandMesh.castShadow = true;
    this.leftHand.add(leftHandMesh);

    const leftThumbMesh = new THREE.Mesh(thumbGeo, leatherMat);
    leftThumbMesh.position.set(0.032, -0.028, 0.015);
    leftThumbMesh.rotation.z = -0.3;
    this.leftHand.add(leftThumbMesh);

    // Right Arm
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.22, 0.41, 0);
    this.torsoGroup.add(this.rightShoulder);

    const rightShoulderCap = new THREE.Mesh(shoulderCapGeo, navyJacketMat);
    this.rightShoulder.add(rightShoulderCap);

    const rightUpperArmMesh = new THREE.Mesh(upperArmGeo, navyJacketMat);
    rightUpperArmMesh.position.y = -0.13;
    rightUpperArmMesh.castShadow = true;
    this.rightShoulder.add(rightUpperArmMesh);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.y = -0.26;
    this.rightShoulder.add(this.rightElbow);

    const rightForearmMesh = new THREE.Mesh(forearmGeo, leatherMat);
    rightForearmMesh.position.y = -0.125;
    rightForearmMesh.castShadow = true;
    this.rightElbow.add(rightForearmMesh);

    this.rightHand = new THREE.Group();
    this.rightHand.position.y = -0.25;
    this.rightElbow.add(this.rightHand);

    const rightHandMesh = new THREE.Mesh(handGeo, leatherMat);
    rightHandMesh.position.set(0, -0.04, 0);
    rightHandMesh.castShadow = true;
    this.rightHand.add(rightHandMesh);

    const rightThumbMesh = new THREE.Mesh(thumbGeo, leatherMat);
    rightThumbMesh.position.set(-0.032, -0.028, 0.015);
    rightThumbMesh.rotation.z = 0.3;
    this.rightHand.add(rightThumbMesh);
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
      this.pelvis.position.y = 0.95 - bounce;
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
      this.pelvis.position.y = THREE.MathUtils.damp(this.pelvis.position.y, 0.95, dampSpeed, delta);
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
