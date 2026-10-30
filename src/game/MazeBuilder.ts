/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MazeData } from '../types/game';
import { WallSegment, buildWallSegments, createWallGeometry } from './WallGeometry';

interface WallChunk {
  cx: number;
  cz: number;
  centerX: number;
  centerZ: number;
  pieces: WallSegment[];
  mesh: THREE.Mesh | null;
}

export class MazeBuilder {
  private scene: THREE.Scene;
  private mazeGroup: THREE.Group;
  private animatedObjects: {
    update: (time: number, delta: number) => void;
  }[] = [];

  // Shared procedural materials and textures for high performance & zero memory leaks
  private materials: {
    wall?: THREE.MeshStandardMaterial;
    wallRune?: THREE.MeshStandardMaterial;
    floor?: THREE.MeshStandardMaterial;
    portalStone?: THREE.MeshStandardMaterial;
    portalCore?: THREE.MeshStandardMaterial;
    portalRing?: THREE.MeshStandardMaterial;
    brazierMetal?: THREE.MeshStandardMaterial;
    brazierCrystal?: THREE.MeshStandardMaterial;
  } = {};

  private textures: THREE.Texture[] = [];
  public portalPosition: THREE.Vector3 = new THREE.Vector3();
  public portalTriggerRadius = 1.8;
  public wallMeshes: THREE.Mesh[] = [];

  // ---- Chunk streaming (walls are built/disposed per chunk around the player) ----
  /** Chunk edge length in grid cells. */
  public static readonly CHUNK_CELLS = 2;
  private chunks: WallChunk[] = [];
  private chunkSpan = 10; // metres (CHUNK_CELLS * cellSize)
  /** Only chunks within this distance (m) of the player are built; Infinity = everything. */
  public viewDistance = Infinity;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mazeGroup = new THREE.Group();
    this.mazeGroup.name = 'maze_environment';
    this.scene.add(this.mazeGroup);

    this.initMaterials();
  }

  /**
   * Initializes procedural PBR materials and textures adhering to the dark navy / violet / cyan aesthetic
   */
  private initMaterials() {
    // Headless / Node.js test environment support
    if (typeof document === 'undefined') {
      this.materials.wall = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.85,
        metalness: 0.15,
        side: THREE.DoubleSide,
      });
      this.materials.wallRune = new THREE.MeshStandardMaterial({
        color: 0x1e1e38,
        roughness: 0.7,
        metalness: 0.2,
        side: THREE.DoubleSide,
      });
      this.materials.floor = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.1 });
      this.materials.portalStone = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.3, metalness: 0.8 });
      this.materials.portalCore = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9 });
      this.materials.portalRing = new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.2, metalness: 0.85 });
      this.materials.brazierMetal = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.8 });
      this.materials.brazierCrystal = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.5 });
      return;
    }

    // 1. Procedural Stone Wall Texture
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const wCtx = wallCanvas.getContext('2d')!;

    // Dark slate stone base
    wCtx.fillStyle = '#0f172a';
    wCtx.fillRect(0, 0, 512, 512);

    // Stone block mortar lines
    wCtx.strokeStyle = '#020617';
    wCtx.lineWidth = 6;
    const rows = 8;
    const cols = 4;
    const rowH = 512 / rows;
    const colW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      wCtx.beginPath();
      wCtx.moveTo(0, y);
      wCtx.lineTo(512, y);
      wCtx.stroke();

      const offset = (r % 2) * (colW * 0.5);
      for (let c = 0; c <= cols; c++) {
        const x = (c * colW + offset) % 512;
        wCtx.beginPath();
        wCtx.moveTo(x, y);
        wCtx.lineTo(x, y + rowH);
        wCtx.stroke();
      }
    }

    // Subtle stone noise & speckles
    wCtx.fillStyle = 'rgba(30, 41, 59, 0.4)';
    for (let i = 0; i < 400; i++) {
      const sx = Math.random() * 512;
      const sy = Math.random() * 512;
      const sr = Math.random() * 3 + 1;
      wCtx.fillRect(sx, sy, sr, sr);
    }

    const wallTexture = new THREE.CanvasTexture(wallCanvas);
    wallTexture.colorSpace = THREE.SRGBColorSpace;
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(2, 2);
    this.textures.push(wallTexture);

    // 2. Procedural Floor Texture (square stone paving; one texture tile equals one maze cell)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 1024;
    floorCanvas.height = 1024;
    const fCtx = floorCanvas.getContext('2d')!;

    fCtx.fillStyle = '#080d1a';
    fCtx.fillRect(0, 0, 1024, 1024);

    // 4 x 4 square paving stones
    fCtx.strokeStyle = '#1e1b4b';
    fCtx.lineWidth = 4;
    for (let i = 0; i <= 1024; i += 256) {
      fCtx.beginPath();
      fCtx.moveTo(i, 0);
      fCtx.lineTo(i, 1024);
      fCtx.stroke();
      fCtx.beginPath();
      fCtx.moveTo(0, i);
      fCtx.lineTo(1024, i);
      fCtx.stroke();
    }

    // Subtle nested square rune in the middle of every cell
    fCtx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
    fCtx.lineWidth = 4;
    for (let half = 80; half <= 320; half += 80) {
      fCtx.strokeRect(512 - half, 512 - half, half * 2, half * 2);
    }

    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(1, 1);
    this.textures.push(floorTexture);

    // 3. Materials
    this.materials.wall = new THREE.MeshStandardMaterial({
      map: wallTexture,
      roughness: 0.85,
      metalness: 0.15,
      color: 0x1e293b,
      side: THREE.DoubleSide,
    });

    this.materials.wallRune = new THREE.MeshStandardMaterial({
      map: wallTexture,
      roughness: 0.7,
      metalness: 0.2,
      color: 0x1e1e38,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
    });

    this.materials.floor = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.9,
      metalness: 0.1,
      color: 0x0f172a,
    });

    this.materials.portalStone = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.3,
      metalness: 0.8,
    });

    this.materials.portalCore = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x818cf8),
      emissiveIntensity: 2.2,
      roughness: 0.1,
      metalness: 0.9,
    });

    this.materials.portalRing = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: new THREE.Color(0xa855f7),
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.85,
    });

    this.materials.brazierMetal = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.6,
      metalness: 0.8,
    });

    this.materials.brazierCrystal = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.5,
    });
  }

  /**
   * Builds the full 3D maze environment for the given maze data
   */
  public buildMaze(maze: MazeData, wallSegments?: WallSegment[]) {
    this.clear();

    const { rows, cols, cellSize, wallHeight, endWorldPos } = maze;

    // 1. Large rectangular ground / floor plane (maze footprint plus a margin)
    const floorW = cols * cellSize + 24;
    const floorD = rows * cellSize + 24;
    const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
    floorGeo.rotateX(-Math.PI / 2);
    const floorUv = floorGeo.getAttribute('uv');
    for (let i = 0; i < floorUv.count; i++) {
      floorUv.setXY(i, floorUv.getX(i) * (floorW / cellSize), floorUv.getY(i) * (floorD / cellSize));
    }
    floorUv.needsUpdate = true;
    const floorMesh = new THREE.Mesh(floorGeo, this.materials.floor);
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    this.mazeGroup.add(floorMesh);

    // 2. Build solid square walls from the single source of truth.
    // Group by grid row and material to keep draw calls low while enabling frustum culling.
    const segments = wallSegments ?? buildWallSegments(maze);

    // Split every wall run at chunk boundaries (render pieces only: collision keeps the full runs,
    // and the pieces tile the exact same boxes) and bucket the pieces per chunk.
    this.viewDistance = Infinity;
    this.buildChunkData(maze, segments);
    // Start fully loaded; the engine then streams chunks around the player via updateChunks().
    this.updateChunks(0, 0, Infinity, Infinity);

    // 3. Start dais / platform
    this.createStartChamber(maze);

    // 4. Exit sanctum / portal monolith (end destination)
    this.createExitSanctum(endWorldPos.x, endWorldPos.z, wallHeight);

    // 5. Wall-mounted crystal sconces (decor only, never guide the player)
    this.createSconces(maze, segments);
  }

  /**
   * Start Chamber dais with ancient circular dais & azure welcoming light
   */
  private createStartChamber(maze: MazeData) {
    const { startWorldPos } = maze;
    const startGroup = new THREE.Group();
    startGroup.position.set(startWorldPos.x, 0, startWorldPos.z);

    // Square stone pedestal
    const daisGeo = new THREE.BoxGeometry(3.6, 0.25, 3.6);
    const daisMesh = new THREE.Mesh(daisGeo, this.materials.portalStone);
    daisMesh.position.y = 0.125;
    daisMesh.receiveShadow = true;
    startGroup.add(daisMesh);

    // Runic square floor seal (4-sided ring turned to line up with the grid)
    const sealGeo = new THREE.RingGeometry(0.8, 1.5, 4, 1, Math.PI / 4);
    sealGeo.rotateX(-Math.PI / 2);
    const sealMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const sealMesh = new THREE.Mesh(sealGeo, sealMat);
    sealMesh.position.y = 0.26;
    startGroup.add(sealMesh);

    // Start point subtle guiding lantern light (does NOT point toward exit)
    const startLight = new THREE.PointLight(0x38bdf8, 2.5, 12, 1.5);
    startLight.position.set(0, 2.2, 0);
    startGroup.add(startLight);

    this.mazeGroup.add(startGroup);
  }

  /**
   * Exit Sanctum: Multi-part mystical portal monument with glowing obelisk and floating energy rings
   */
  private createExitSanctum(x: number, z: number, wallHeight: number) {
    this.portalPosition.set(x, 1.5, z);
    const portalGroup = new THREE.Group();
    portalGroup.position.set(x, 0, z);

    // 1. Base pedestal
    const baseGeo = new THREE.BoxGeometry(3.8, 0.4, 3.8);
    const baseMesh = new THREE.Mesh(baseGeo, this.materials.portalStone);
    baseMesh.position.y = 0.2;
    portalGroup.add(baseMesh);

    // 2. Glowing inner ring dais
    const ringDaisGeo = new THREE.TorusGeometry(1.6, 0.12, 16, 48);
    ringDaisGeo.rotateX(Math.PI / 2);
    const ringDaisMesh = new THREE.Mesh(ringDaisGeo, this.materials.portalRing);
    ringDaisMesh.position.y = 0.42;
    portalGroup.add(ringDaisMesh);

    // 3. Central floating obsidian monolith (composite structure: 4-sided beveled crystal)
    const obeliskGeo = new THREE.OctahedronGeometry(1.2, 0);
    obeliskGeo.scale(0.8, 2.2, 0.8);
    const obeliskMesh = new THREE.Mesh(obeliskGeo, this.materials.portalCore);
    obeliskMesh.position.y = 2.4;
    obeliskMesh.castShadow = true;
    portalGroup.add(obeliskMesh);

    // 4. Rotating cosmic energy ring 1 (tilted)
    const energyRing1Geo = new THREE.TorusGeometry(1.3, 0.08, 16, 48);
    const energyRing1 = new THREE.Mesh(energyRing1Geo, this.materials.portalRing);
    energyRing1.position.y = 2.4;
    portalGroup.add(energyRing1);

    // 5. Rotating cosmic energy ring 2 (differently tilted)
    const energyRing2Geo = new THREE.TorusGeometry(1.6, 0.06, 16, 48);
    const energyRing2 = new THREE.Mesh(energyRing2Geo, this.materials.portalRing);
    energyRing2.position.y = 2.4;
    portalGroup.add(energyRing2);

    // 6. Upward beacon light beam contained within chamber walls (does not protrude above walls)
    const beamHeight = wallHeight * 0.9;
    const beamGeo = new THREE.CylinderGeometry(0.4, 0.8, beamHeight, 24, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = beamHeight / 2;
    portalGroup.add(beamMesh);

    // 7. Mystical point lights at the portal heart (confined to chamber radius)
    const portalLight = new THREE.PointLight(0xa855f7, 3.5, 6.5, 2.0);
    portalLight.position.set(0, 2.4, 0);
    portalGroup.add(portalLight);

    const cyanLight = new THREE.PointLight(0x38bdf8, 2.5, 5.0, 2.0);
    cyanLight.position.set(0, 1.5, 0);
    portalGroup.add(cyanLight);

    // Register rotation animation
    this.animatedObjects.push({
      update: (time: number) => {
        obeliskMesh.rotation.y = time * 0.8;
        obeliskMesh.position.y = 2.4 + Math.sin(time * 2.0) * 0.15;

        energyRing1.rotation.x = time * 1.2;
        energyRing1.rotation.y = time * 0.9;

        energyRing2.rotation.x = -time * 0.8;
        energyRing2.rotation.z = time * 1.1;

        beamMesh.rotation.y = -time * 0.3;
        portalLight.intensity = 4.5 + Math.sin(time * 3.5) * 1.2;
      },
    });

    this.mazeGroup.add(portalGroup);
  }

  /**
   * Places decorative crystal sconces mounted flat on wall faces.
   * They protrude less than the player's body clearance, so nothing the player can see is ever walked through.
   * Only a handful carry a point light to keep mobile performance good.
   */
  private createSconces(maze: MazeData, segments: WallSegment[]) {
    const maxSconces = 12;
    const maxLights = 8;
    let placed = 0;
    const crystalGeo = new THREE.OctahedronGeometry(0.16, 0);

    for (let i = 0; i < segments.length && placed < maxSconces; i++) {
      const seg = segments[i];
      // Spread sconces deterministically along the walls
      if ((i + maze.seed) % 4 !== 0) continue;

      const isHorizontal = seg.orientation === 'horizontal';
      const length = isHorizontal ? seg.maxX - seg.minX : seg.maxZ - seg.minZ;
      if (length < maze.cellSize * 0.9) continue;

      // Mount at the midpoint of the run, on the face that points to the maze interior side (+1 / -1 alternating)
      const side = placed % 2 === 0 ? 1 : -1;
      const cx = (seg.minX + seg.maxX) / 2;
      const cz = (seg.minZ + seg.maxZ) / 2;
      const offset = seg.thickness / 2 + 0.07;
      const sx = isHorizontal ? cx : cx + side * offset;
      const sz = isHorizontal ? cz + side * offset : cz;

      const group = new THREE.Group();
      group.position.set(sx, 2.3, sz);

      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), this.materials.brazierMetal);
      group.add(bracket);

      const crystal = new THREE.Mesh(crystalGeo, this.materials.brazierCrystal);
      crystal.position.set(isHorizontal ? 0 : side * 0.08, 0.2, isHorizontal ? side * 0.08 : 0);
      group.add(crystal);

      let light: THREE.PointLight | null = null;
      if (placed < maxLights) {
        light = new THREE.PointLight(0x818cf8, 1.6, 9, 2.0);
        light.position.set(isHorizontal ? 0 : side * 0.3, 0.2, isHorizontal ? side * 0.3 : 0);
        group.add(light);
      }

      const phase = placed;
      this.animatedObjects.push({
        update: (time: number) => {
          crystal.rotation.y = time * 1.5;
          if (light) light.intensity = 1.5 + Math.sin(time * 5.0 + phase) * 0.3;
        },
      });

      this.mazeGroup.add(group);
      placed++;
    }
  }

  /**
   * Called every frame in the game loop to update animated objects (portal rotation, flickering braziers)
   */
  public update(time: number, delta: number) {
    for (const obj of this.animatedObjects) {
      obj.update(time, delta);
    }
  }

  private buildChunkData(maze: MazeData, segments: WallSegment[]) {
    const { rows, cols, cellSize } = maze;
    const span = MazeBuilder.CHUNK_CELLS * cellSize;
    this.chunkSpan = span;
    const x0 = (-cols / 2) * cellSize;
    const z0 = (-rows / 2) * cellSize;
    const nx = Math.ceil((cols * cellSize) / span);
    const nz = Math.ceil((rows * cellSize) / span);
    const map = new Map<string, WallChunk>();
    const getChunk = (cx: number, cz: number) => {
      const key = cx + ',' + cz;
      let c = map.get(key);
      if (!c) {
        c = {
          cx, cz,
          centerX: x0 + (cx + 0.5) * span,
          centerZ: z0 + (cz + 0.5) * span,
          pieces: [],
          mesh: null,
        };
        map.set(key, c);
      }
      return c;
    };
    const clampIdx = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));

    for (const seg of segments) {
      const alongX = seg.maxX - seg.minX >= seg.maxZ - seg.minZ;
      if (alongX) {
        const cz = clampIdx(Math.floor(((seg.minZ + seg.maxZ) / 2 - z0) / span + 1e-9), nz);
        const first = clampIdx(Math.floor((seg.minX - x0) / span + 1e-9), nx);
        const last = clampIdx(Math.floor((seg.maxX - x0) / span - 1e-9), nx);
        for (let cx = first; cx <= last; cx++) {
          const minX = cx === first ? seg.minX : x0 + cx * span;
          const maxX = cx === last ? seg.maxX : x0 + (cx + 1) * span;
          if (maxX - minX > 1e-6) getChunk(cx, cz).pieces.push({ ...seg, minX, maxX });
        }
      } else {
        const cx = clampIdx(Math.floor(((seg.minX + seg.maxX) / 2 - x0) / span + 1e-9), nx);
        const first = clampIdx(Math.floor((seg.minZ - z0) / span + 1e-9), nz);
        const last = clampIdx(Math.floor((seg.maxZ - z0) / span - 1e-9), nz);
        for (let cz = first; cz <= last; cz++) {
          const minZ = cz === first ? seg.minZ : z0 + cz * span;
          const maxZ = cz === last ? seg.maxZ : z0 + (cz + 1) * span;
          if (maxZ - minZ > 1e-6) getChunk(cx, cz).pieces.push({ ...seg, minZ, maxZ });
        }
      }
    }
    this.chunks = Array.from(map.values());
  }

  private loadChunk(chunk: WallChunk) {
    if (chunk.mesh || chunk.pieces.length === 0) return;
    const geos = chunk.pieces.map((piece) => createWallGeometry(piece));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.materials.wall);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mazeGroup.add(mesh);
    this.wallMeshes.push(mesh);
    chunk.mesh = mesh;
  }

  private unloadChunk(chunk: WallChunk) {
    const mesh = chunk.mesh;
    if (!mesh) return;
    this.mazeGroup.remove(mesh);
    mesh.geometry.dispose();
    const i = this.wallMeshes.indexOf(mesh);
    if (i >= 0) this.wallMeshes.splice(i, 1);
    chunk.mesh = null;
  }

  /**
   * Streams wall chunks around (px, pz): builds chunks inside viewDistance (nearest first, at most
   * `loadBudget` per call to avoid frame hitches) and frees chunks that fell outside it.
   */
  public updateChunks(px: number, pz: number, loadBudget = 3, unloadBudget = Infinity) {
    const reach = this.viewDistance + this.chunkSpan * 0.71; // chunk centre -> farthest corner
    const keep = reach + this.chunkSpan; // hysteresis so chunks do not flicker at the edge
    let unloaded = 0;
    const toLoad: { chunk: WallChunk; d: number }[] = [];
    for (const chunk of this.chunks) {
      const d = Math.hypot(chunk.centerX - px, chunk.centerZ - pz);
      if (chunk.mesh) {
        if (d > keep && unloaded < unloadBudget) {
          this.unloadChunk(chunk);
          unloaded++;
        }
      } else if (d <= reach) {
        toLoad.push({ chunk, d });
      }
    }
    if (toLoad.length > 1) toLoad.sort((a, b) => a.d - b.d);
    for (let i = 0; i < toLoad.length && i < loadBudget; i++) {
      this.loadChunk(toLoad[i].chunk);
    }
  }

  public get loadedChunkCount() {
    return this.chunks.filter((c) => c.mesh).length;
  }

  public get totalChunkCount() {
    return this.chunks.length;
  }

  /**
   * Cleanly disposes of all geometry, materials, and children in the maze group
   */
  public clear() {
    this.animatedObjects = [];
    this.wallMeshes = [];
    this.chunks = [];

    while (this.mazeGroup.children.length > 0) {
      const child = this.mazeGroup.children[0];
      this.mazeGroup.remove(child);

      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          if (node.geometry) {
            node.geometry.dispose();
          }
        }
        if (node instanceof THREE.Light) {
          node.dispose();
        }
      });
    }
  }

  /**
   * Fully disposes builder resources on app unmount
   */
  public dispose() {
    this.clear();
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures = [];

    Object.values(this.materials).forEach((mat) => {
      mat?.dispose();
    });
    this.materials = {};

    this.scene.remove(this.mazeGroup);
  }
}
