/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MazeData, GameState, GameSettings, DIFFICULTY_PRESETS, DifficultyLevel } from '../types/game';
import { MazeGenerator } from './MazeGenerator';
import { MazeBuilder } from './MazeBuilder';
import { CollisionSystem } from './CollisionSystem';
import { PlayerController } from './PlayerController';
import { NpcManager } from './NpcManager';
import { getSkinTexture, getWeaponTexture, WEAPONS } from './Skins';
import { PlayerCharacter } from './PlayerCharacter';
import { AudioManager } from './AudioManager';
import { buildWallSegments } from './WallGeometry';

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  // Subsystems
  public mazeData!: MazeData;
  public collisionSystem!: CollisionSystem;
  public mazeBuilder!: MazeBuilder;
  public playerController!: PlayerController;
  public playerCharacter!: PlayerCharacter;
  public npcManager!: NpcManager;
  private playerSkin = 0;
  private playerWeapon = 0;

  private applyWeapon() {
    if (!this.playerCharacter) return;
    const def = WEAPONS[this.playerWeapon];
    const tex = def?.url ? getWeaponTexture(this.playerWeapon) : null;
    this.playerCharacter.setWeapon(def && tex ? { texture: tex, size: def.size, grip: def.grip } : null);
  }
  public audioManager: AudioManager;

  // Particles
  private particleSystem!: THREE.Points;
  private particlePositions!: Float32Array;

  // State
  public gameState: GameState = 'TITLE';
  private isSoftwareGl: boolean;
  private animFrameId = 0;
  private isDisposed = false;
  private resizeObserver: ResizeObserver | null = null;

  // Title screen camera orbit
  private titleOrbitAngle = 0;

  // Line of sight and camera collision raycasting helpers (zero-GC in render loop)
  private raycaster = new THREE.Raycaster();
  private raycastDir = new THREE.Vector3();
  private camProbeOrigin = new THREE.Vector3();
  private camProbeDir = new THREE.Vector3();
  private _camCenterTarget = new THREE.Vector3();
  private _probeTarget = new THREE.Vector3();
  private _probeDir = new THREE.Vector3();
  private _camProbeRight = new THREE.Vector3();
  private _camProbeUp = new THREE.Vector3(0, 1, 0);

  // Callbacks to UI
  public onVictory?: () => void;

  constructor(container: HTMLElement, audioManager: AudioManager) {
    this.container = container;
    this.audioManager = audioManager;

    // Detect software WebGL
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 1. Initialize Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 2. Initialize Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020617);
    this.scene.fog = new THREE.FogExp2(0x030712, 0.028);

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.05,
      250
    );

    this.clock = new THREE.Clock();

    // 4. Lighting Rig
    this.setupLighting();

    // 5. Procedural Studio Environment
    this.setupEnvironment();

    // 6. Floating Mystical Particle System
    this.setupParticles();

    // 7. Initial Maze Generation (Default to Novice for fast instant title preview)
    this.initMaze('novice');

    // 8. Event Listeners & Dynamic Viewport Observers
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.handleResize);
      window.visualViewport.addEventListener('scroll', this.handleResize);
    }
    if (typeof ResizeObserver !== 'undefined' && this.container) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }

    // 9. Start Loop
    this.startLoop();
  }

  private setupLighting() {
    // Ambient / Fill light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e1b4b, 0.8);
    this.scene.add(hemiLight);

    // Directional Key Light (mystical moonlight)
    const keyLight = new THREE.DirectionalLight(0xa5b4fc, 1.2);
    keyLight.position.set(40, 60, 30);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 160;
      const d = 50;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);
  }

  private setupEnvironment() {
    try {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch {
      // Graceful fallback
    }
  }

  private setupParticles() {
    const particleCount = this.isSoftwareGl ? 200 : 800;
    const geometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(particleCount * 3);

    const radiusSpread = 60;
    for (let i = 0; i < particleCount; i++) {
      const r = Math.random() * radiusSpread;
      const angle = Math.random() * Math.PI * 2;
      this.particlePositions[i * 3] = Math.cos(angle) * r;
      this.particlePositions[i * 3 + 1] = Math.random() * 8 + 0.5; // Height 0.5 to 8.5
      this.particlePositions[i * 3 + 2] = Math.sin(angle) * r;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    // Particle texture (soft circular glow)
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d')!;
    const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(192, 132, 252, 1)');
    grad.addColorStop(0.4, 'rgba(56, 189, 248, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 64, 64);

    const pTex = new THREE.CanvasTexture(pCanvas);
    pTex.colorSpace = THREE.SRGBColorSpace;

    const pMat = new THREE.PointsMaterial({
      size: 0.6,
      map: pTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particleSystem = new THREE.Points(geometry, pMat);
    this.scene.add(this.particleSystem);
  }

  /**
   * Initializes or regenerates the procedural maze
   */
  public initMaze(difficulty: DifficultyLevel, seed?: number) {
    const config = DIFFICULTY_PRESETS[difficulty];
    this.mazeData = MazeGenerator.generate(config, seed);
    const wallSegments = buildWallSegments(this.mazeData);

    if (!this.collisionSystem) {
      this.collisionSystem = new CollisionSystem(this.mazeData, wallSegments);
    } else {
      this.collisionSystem.updateMaze(this.mazeData, wallSegments);
    }

    if (!this.mazeBuilder) {
      this.mazeBuilder = new MazeBuilder(this.scene);
    }
    this.mazeBuilder.buildMaze(this.mazeData, wallSegments);

    if (!this.playerController) {
      this.playerController = new PlayerController(this.camera, this.collisionSystem, this.audioManager);
    }
    this.playerController.maxCameraHeight = this.mazeData.wallHeight - 1.2;
    // Place player at Start position
    this.playerController.resetTo(
      this.mazeData.startWorldPos.x,
      this.mazeData.startWorldPos.z,
      this.mazeData.startYaw
    );

    if (!this.playerCharacter) {
      this.playerCharacter = new PlayerCharacter(undefined, getSkinTexture(this.playerSkin));
      this.scene.add(this.playerCharacter.root);
      this.applyWeapon();
    }
    this.playerCharacter.root.position.set(
      this.mazeData.startWorldPos.x,
      0,
      this.mazeData.startWorldPos.z
    );

    if (!this.npcManager) {
      this.npcManager = new NpcManager(this.scene);
    }
    this.npcManager.spawn(this.mazeData);
  }

  /** Hand actions driven by on-screen buttons / keys. */
  public doAttack() {
    this.playerCharacter?.triggerAttack();
    this.npcManager?.queueHit();
  }
  public setDefend(active: boolean) {
    this.playerCharacter?.setDefending(active);
  }
  public doEmote() {
    this.playerCharacter?.triggerEmote();
  }

  public setGameState(state: GameState) {
    const previousState = this.gameState;
    this.gameState = state;

    if (state !== 'PLAYING') {
      this.audioManager.setPortalActive(false);
      // Immediately stop movement and look input when leaving active play
      if (this.playerController) {
        this.playerController.currentInput.moveX = 0;
        this.playerController.currentInput.moveZ = 0;
        this.playerController.currentInput.lookDeltaX = 0;
        this.playerController.currentInput.lookDeltaY = 0;
        this.playerController.currentInput.isSprinting = false;
      }
    }

    if (state === 'PLAYING') {
      // Consume clock delta so the first tick after resume has dt = 0, preventing any time jump
      this.clock.getDelta();

      // Only reset player transform if starting fresh from Title screen
      if (previousState === 'TITLE') {
        this.playerController.resetTo(
          this.mazeData.startWorldPos.x,
          this.mazeData.startWorldPos.z,
          this.mazeData.startYaw
        );
      }
    }
  }

  public applySettings(settings: GameSettings) {
    this.playerController.lookSensitivity = settings.lookSensitivity;
    this.playerController.invertY = settings.invertY;
    if (typeof settings.characterWeapon === 'number' && settings.characterWeapon !== this.playerWeapon) {
      this.playerWeapon = settings.characterWeapon;
      this.applyWeapon();
    }
    if (typeof settings.characterSkin === 'number' && settings.characterSkin !== this.playerSkin) {
      this.playerSkin = settings.characterSkin;
      const tex = getSkinTexture(this.playerSkin);
      if (tex && this.playerCharacter) this.playerCharacter.setSkin(tex);
    }
    if (settings.cameraMode) {
      this.playerController.setCameraMode(settings.cameraMode);
    }
    this.audioManager.setVolumes(settings.soundVolume, settings.musicVolume, settings.isMuted);

    // Graphic Quality adjustments
    if (settings.quality === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.scene.fog = new THREE.FogExp2(0x030712, 0.045);
    } else if (settings.quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = !this.isSoftwareGl;
      this.scene.fog = new THREE.FogExp2(0x030712, 0.035);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
      this.renderer.shadowMap.enabled = !this.isSoftwareGl;
      this.scene.fog = new THREE.FogExp2(0x030712, 0.025);
    }
  }

  private handleResize = () => {
    if (!this.container || this.isDisposed) return;

    // Use visual viewport if available (vital on Android/Brave when dynamic toolbars collapse/expand)
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const rect = this.container.getBoundingClientRect();

    let width = rect.width;
    let height = rect.height;

    if (vv && vv.width > 0 && vv.height > 0) {
      // If container occupies full screen, match exact visible viewport pixels
      const isFullScreen = rect.width === 0 || Math.abs(rect.width - window.innerWidth) < 10;
      if (isFullScreen) {
        width = vv.width;
        height = vv.height;
      }
    }

    if (width <= 0 || height <= 0) {
      width = this.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
      height = this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
    }

    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private handleOrientationChange = () => {
    window.setTimeout(this.handleResize, 50);
    window.setTimeout(this.handleResize, 200);
  };

  private startLoop() {
    const afterDraw = (cb: () => void) => {
      try {
        const gl = this.renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            this.animFrameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.animFrameId = window.setTimeout(cb, 60);
          }
        };
        this.animFrameId = window.setTimeout(poll, 5);
      } catch {
        this.animFrameId = requestAnimationFrame(cb);
      }
    };

    const tick = () => {
      if (this.isDisposed) return;

      const rawDt = this.clock.getDelta();
      const delta = Math.min(rawDt, 0.05); // Clamp dt to prevent tunneling
      const elapsedTime = this.clock.getElapsedTime();

      this.update(elapsedTime, delta);

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.animFrameId = requestAnimationFrame(tick);
      }
    };

    tick();
  }

  private update(elapsedTime: number, delta: number) {
    // 1. Update animated objects in maze (portal monolith, braziers)
    this.mazeBuilder.update(elapsedTime, delta);

    // 2. Update floating ethereal dust particles
    if (this.particlePositions) {
      const count = this.particlePositions.length / 3;
      for (let i = 0; i < count; i++) {
        // Subtle upward drift & swirl
        this.particlePositions[i * 3 + 1] += delta * 0.4;
        if (this.particlePositions[i * 3 + 1] > 8.0) {
          this.particlePositions[i * 3 + 1] = 0.5;
        }
      }
      this.particleSystem.geometry.attributes.position.needsUpdate = true;
      this.particleSystem.rotation.y = elapsedTime * 0.015;
    }

    // 3. Game State Logic
    if (this.gameState === 'TITLE') {
      // Cinematic orbital camera view showcasing the square labyrinth
      this.titleOrbitAngle += delta * 0.12;
      this.npcManager?.update(delta, 1e6, 1e6, 0);
      // Title orbit view shows the whole labyrinth: stream everything in
      this.mazeBuilder.viewDistance = Infinity;
      this.mazeBuilder.updateChunks(0, 0, 4);
      const mazeSpan = Math.max(this.mazeData.rows, this.mazeData.cols) * this.mazeData.cellSize;
      const camRadius = mazeSpan * 0.85;
      const camHeight = 28 + Math.sin(elapsedTime * 0.4) * 4;

      this.camera.position.set(
        Math.cos(this.titleOrbitAngle) * camRadius,
        camHeight,
        Math.sin(this.titleOrbitAngle) * camRadius
      );
      this.camera.lookAt(0, 2.5, 0);

      // Character idle stance at labyrinth start point
      if (this.playerCharacter) {
        this.playerCharacter.update(
          delta,
          this.mazeData.startWorldPos.x,
          this.mazeData.startWorldPos.z,
          this.titleOrbitAngle,
          0,
          false,
          false,
          0,
          0,
          false,
          2.4,
          1.0
        );
      }
    } else if (this.gameState === 'PLAYING') {
      // Third-person camera wall collision check
      if (
        this.playerController.cameraMode === 'third-person' ||
        this.playerController.cameraTransitionProgress > 0.01
      ) {
        // Probe origin: focal point on character mid-torso (y = 1.15m)
        const focusY = this.playerController.cameraFocusY;
        this.camProbeOrigin.set(
          this.playerController.position.x,
          focusY,
          this.playerController.position.z
        );

        // Compute ideal camera position behind player at full distance (2.4m)
        const tpPitch = Math.max(-0.6, Math.min(0.45, this.playerController.rotationPitch));
        const cosPitch = Math.cos(tpPitch);
        const sinPitch = Math.sin(tpPitch);
        const yaw = this.playerController.rotationYaw;

        const maxDist = 2.4;
        const offsetX = Math.sin(yaw) * (cosPitch * maxDist);
        const offsetZ = Math.cos(yaw) * (cosPitch * maxDist);
        const offsetY = 0.35 - sinPitch * maxDist; // must match PlayerController (positive pitch = look up = camera lower)

        this._camCenterTarget.set(
          this.camProbeOrigin.x + offsetX,
          this.camProbeOrigin.y + offsetY,
          this.camProbeOrigin.z + offsetZ
        );

        // Lateral and vertical camera offset axes for multi-ray frustum probing
        this._camProbeRight.set(Math.cos(yaw), 0, -Math.sin(yaw));

        // Multi-ray probe: Center, Left, Right, Top, Bottom
        // Side offsets prevent camera viewport corners from clipping protruding walls at junctions
        const probeOffsets = [
          { dx: 0, dy: 0, dz: 0 },
          { dx: this._camProbeRight.x * 0.22, dy: 0, dz: this._camProbeRight.z * 0.22 },
          { dx: -this._camProbeRight.x * 0.22, dy: 0, dz: -this._camProbeRight.z * 0.22 },
          { dx: 0, dy: 0.18, dz: 0 },
          { dx: 0, dy: -0.15, dz: 0 },
        ];

        let shortestAllowedDist = maxDist;

        for (let i = 0; i < probeOffsets.length; i++) {
          const off = probeOffsets[i];
          this._probeTarget.set(
            this._camCenterTarget.x + off.dx,
            this._camCenterTarget.y + off.dy,
            this._camCenterTarget.z + off.dz
          );

          this._probeDir.subVectors(this._probeTarget, this.camProbeOrigin);
          const probeLen = this._probeDir.length();
          if (probeLen > 0.05) {
            this._probeDir.normalize();
            this.raycaster.set(this.camProbeOrigin, this._probeDir);
            this.raycaster.near = 0.05;
            this.raycaster.far = probeLen;

            const hits = this.raycaster.intersectObjects(this.mazeBuilder.wallMeshes, false);
            if (hits.length > 0) {
              // Keep camera 0.25m in front of wall hit point to prevent near-plane clipping
              const safeDist = Math.max(0.22, hits[0].distance - 0.25);
              if (safeDist < shortestAllowedDist) {
                shortestAllowedDist = safeDist;
              }
            }
          }
        }

        this.playerController.targetThirdPersonDist = shortestAllowedDist;
      }

      // First/Third-person player controller movement
      this.playerController.update(delta);

      // Chunk streaming: only build wall geometry the fog lets the player actually see
      const fog = this.scene.fog as THREE.FogExp2 | null;
      this.mazeBuilder.viewDistance = fog && fog.density > 0 ? 1.3 / fog.density : Infinity;
      this.mazeBuilder.updateChunks(this.playerController.position.x, this.playerController.position.z, 3);
      this.npcManager?.update(
        delta,
        this.playerController.position.x,
        this.playerController.position.z,
        // Attacks land where the CHARACTER faces (in third person the camera can orbit away from it)
        this.playerCharacter ? this.playerCharacter.facingYaw : this.playerController.rotationYaw
      );
      // NPCs are solid: push the player out of them, then keep the result inside the maze walls
      if (this.npcManager) {
        const pushed = this.npcManager.pushPlayerOut(
          this.playerController.position.x,
          this.playerController.position.z
        );
        const safe = this.collisionSystem.resolvePosition(pushed.x, pushed.z);
        this.playerController.position.x = safe.x;
        this.playerController.position.z = safe.z;
      }

      // Procedural Character animation & kinematics
      // In first-person, neck-down body is visible when looking down/forward; head and neck are hidden.
      // In third-person, full articulated model is visible.
      if (this.playerCharacter) {
        const isFirstPerson = this.playerController.cameraTransitionProgress < 0.15;
        this.playerCharacter.update(
          delta,
          this.playerController.position.x,
          this.playerController.position.z,
          this.playerController.rotationYaw,
          this.playerController.currentSpeed,
          this.playerController.isMoving,
          this.playerController.currentInput.isSprinting,
          this.playerController.moveWorldDirX,
          this.playerController.moveWorldDirZ,
          isFirstPerson,
          this.playerController.thirdPersonDistance,
          this.playerController.forwardSwingLimit
        );
      }

      // Smooth FOV sprint expansion
      const targetFov = this.playerController.currentInput.isSprinting ? 83 : 75;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, delta);
      this.camera.updateProjectionMatrix();

      // Check distance to exit portal
      const distToExit = Math.hypot(
        this.playerController.position.x - this.mazeBuilder.portalPosition.x,
        this.playerController.position.z - this.mazeBuilder.portalPosition.z
      );

      // The portal only makes a constant, non-distance-based ambient sound when it is already
      // within the player's natural line of sight and very close (inside the same chamber).
      // Otherwise it is completely silent.
      const chamberRadius = this.mazeData.cellSize * 0.7; // about one chamber (3.5m)
      let isPortalAudible = false;

      if (distToExit <= chamberRadius) {
        // Test unobstructed line of sight from player's eye to portal center
        const playerEye = this.camera.position;
        const portalCenter = this.mazeBuilder.portalPosition;
        this.raycastDir.subVectors(portalCenter, playerEye);
        const rayLen = this.raycastDir.length();

        if (rayLen > 0.05) {
          this.raycastDir.normalize();
          this.raycaster.set(playerEye, this.raycastDir);
          this.raycaster.near = 0.1;
          this.raycaster.far = Math.max(0.1, rayLen - 0.4);

          const wallHits = this.raycaster.intersectObjects(this.mazeBuilder.wallMeshes, false);
          if (wallHits.length === 0) {
            isPortalAudible = true;
          }
        }
      }

      this.audioManager.setPortalActive(isPortalAudible);

      // Check exit trigger
      if (distToExit < this.mazeBuilder.portalTriggerRadius) {
        this.audioManager.setPortalActive(false);
        this.audioManager.playVictoryFanfare();
        this.setGameState('VICTORY');
        if (this.onVictory) {
          this.onVictory();
        }
      }
    } else if (this.gameState === 'VICTORY') {
      // Slow celebratory orbit around the exit portal and player
      this.titleOrbitAngle += delta * 0.4;
      const pX = this.mazeBuilder.portalPosition.x;
      const pZ = this.mazeBuilder.portalPosition.z;
      const camR = 6.0;

      this.camera.position.set(
        pX + Math.cos(this.titleOrbitAngle) * camR,
        3.5 + Math.sin(elapsedTime * 0.8) * 0.5,
        pZ + Math.sin(this.titleOrbitAngle) * camR
      );
      this.camera.lookAt(pX, 2.4, pZ);

      if (this.playerCharacter) {
        this.playerCharacter.update(
          delta,
          this.playerController.position.x,
          this.playerController.position.z,
          this.titleOrbitAngle,
          0,
          false,
          false,
          0,
          0,
          false,
          2.4,
          1.0
        );
      }
    }
  }

  public dispose() {
    this.isDisposed = true;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleResize);
      window.visualViewport.removeEventListener('scroll', this.handleResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.isSoftwareGl) {
      clearTimeout(this.animFrameId);
    } else {
      cancelAnimationFrame(this.animFrameId);
    }

    if (this.npcManager) {
      this.npcManager.dispose();
    }
    if (this.playerCharacter) {
      this.playerCharacter.dispose();
    }

    if (this.mazeBuilder) {
      this.mazeBuilder.dispose();
    }

    if (this.particleSystem) {
      this.particleSystem.geometry.dispose();
      (this.particleSystem.material as THREE.Material).dispose();
    }

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
