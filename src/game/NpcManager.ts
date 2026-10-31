/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { MazeData, cellCenterToWorld, getOpenNeighbors } from '../types/game';
import { createRNG } from './MazeGenerator';
import { PlayerCharacter, CharacterPalette } from './PlayerCharacter';
import { getSkinTexture, SKIN_COUNT } from './Skins';

const PALETTES: CharacterPalette[] = [
  { skin: 0xb58a6a, hair: 0x2a1b10, shirt: 0x8b5a2b, pants: 0x4a3a2a, shoe: 0x2f2a25 }, // villager
  { skin: 0xd9a98a, hair: 0xe5e5e5, shirt: 0x7c3aed, pants: 0x312e81, shoe: 0x1f1b3a }, // mage
  { skin: 0xc99673, hair: 0x6b3b1d, shirt: 0x9ca3af, pants: 0x374151, shoe: 0x1f2937 }, // guard
  { skin: 0xe0b08f, hair: 0x5b3a1a, shirt: 0x3f8f3f, pants: 0x5b4a2a, shoe: 0x3a2a1a }, // ranger
  { skin: 0xa5714f, hair: 0x111111, shirt: 0xc2410c, pants: 0x44403c, shoe: 0x292524 }, // traveler
];

const NPC_COUNT: Record<string, number> = { novice: 3, explorer: 4, master: 5 };
const NPC_SPEED = 1.8; // m/s
const HIT_RANGE = 2.3;
const HIT_DELAY = 0.18; // swing connects partway through the attack animation
const STUN_TIME = 1.4;
const NPC_RADIUS = 0.4;
const PLAYER_RADIUS = 0.45;
const BLOCK_DIST = 1.15; // an NPC stops when the player stands in its way this close

interface Npc {
  character: PlayerCharacter;
  row: number;
  col: number;
  prevRow: number;
  prevCol: number;
  toRow: number;
  toCol: number;
  t: number; // 0..1 progress along current cell-to-cell segment
  wait: number;
  stun: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  moving: boolean;
}

/**
 * Friendly wandering blocky NPCs. They follow open passages cell-to-cell along the
 * corridor centre lines (so they never touch walls), choose random turns, and give no
 * hint about the route or the exit. Hitting one with Attack makes it flinch and freeze.
 */
export class NpcManager {
  private npcs: Npc[] = [];
  private rng: () => number = Math.random;
  private maze: MazeData | null = null;
  private pendingHit = -1;

  constructor(private scene: THREE.Scene) {}

  public get count() {
    return this.npcs.length;
  }

  public getPositions(): { x: number; z: number }[] {
    return this.npcs.map((n) => ({ x: n.x, z: n.z }));
  }

  public spawn(maze: MazeData) {
    this.clear();
    this.maze = maze;
    this.rng = createRNG((maze.seed ^ 0x9e3779b9) >>> 0);
    const count = maze.playground ? 6 : (NPC_COUNT[maze.difficulty] ?? 3);
    const used = new Set<string>();
    let attempts = 0;
    while (this.npcs.length < count && attempts++ < 400) {
      const row = Math.floor(this.rng() * maze.rows);
      const col = Math.floor(this.rng() * maze.cols);
      const key = `${row},${col}`;
      if (used.has(key)) continue;
      // Keep clear of the start area and the exit chamber
      if (Math.abs(row - maze.startCoord.row) + Math.abs(col - maze.startCoord.col) < 4) continue;
      if (Math.abs(row - maze.endCoord.row) + Math.abs(col - maze.endCoord.col) < 3) continue;
      used.add(key);

      const character = new PlayerCharacter(
        PALETTES[this.npcs.length % PALETTES.length],
        getSkinTexture(this.npcs.length % SKIN_COUNT) // the three bundled skins, used in rotation
      );
      character.sword.visible = false;
      this.scene.add(character.root);
      const p = cellCenterToWorld(row, col, maze.rows, maze.cols, maze.cellSize);
      this.npcs.push({
        character,
        row, col, prevRow: row, prevCol: col, toRow: row, toCol: col,
        t: 1, wait: this.rng() * 1.5, stun: 0,
        x: p.x, z: p.z, dirX: 0, dirZ: 1, moving: false,
      });
    }
  }

  /** Called when the player swings; resolves the hit shortly after, mid-swing. */
  public queueHit() {
    this.pendingHit = HIT_DELAY;
  }

  public update(delta: number, playerX: number, playerZ: number, playerYaw: number) {
    const maze = this.maze;
    if (!maze) return;

    if (this.pendingHit >= 0) {
      this.pendingHit -= delta;
      if (this.pendingHit < 0) this.resolveHit(playerX, playerZ, playerYaw);
    }

    for (const n of this.npcs) {
      if (n.stun > 0) {
        n.stun -= delta;
        n.moving = false;
        if (n.stun <= 0) {
          n.character.setDefending(false);
          n.character.setTint(0);
        }
      } else if (n.t >= 1) {
        // At a cell centre: pause briefly, then pick the next open passage
        n.moving = false;
        n.wait -= delta;
        if (n.wait <= 0) this.chooseNext(n, maze);
      } else if (this.isPlayerInWay(n, playerX, playerZ)) {
        // Player is blocking the passage ahead: wait politely instead of walking through
        n.moving = false;
      } else {
        n.t = Math.min(1, n.t + (NPC_SPEED * delta) / maze.cellSize);
        n.moving = true;
        const a = cellCenterToWorld(n.row, n.col, maze.rows, maze.cols, maze.cellSize);
        const b = cellCenterToWorld(n.toRow, n.toCol, maze.rows, maze.cols, maze.cellSize);
        n.x = a.x + (b.x - a.x) * n.t;
        n.z = a.z + (b.z - a.z) * n.t;
        if (n.t >= 1) {
          n.prevRow = n.row;
          n.prevCol = n.col;
          n.row = n.toRow;
          n.col = n.toCol;
          n.wait = 0.2 + this.rng() * 1.6;
          n.moving = false;
        }
      }

      n.character.update(
        delta, n.x, n.z, 0,
        n.moving ? NPC_SPEED : 0,
        n.moving, false, n.dirX, n.dirZ,
        false, 2.4, 1.0
      );
    }
  }

  private isPlayerInWay(n: Npc, px: number, pz: number): boolean {
    const dx = px - n.x;
    const dz = pz - n.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BLOCK_DIST) return false;
    return dx * n.dirX + dz * n.dirZ > 0; // only when the player is ahead of it
  }

  /**
   * Solid-body push: returns the player position moved out of any overlapping NPC.
   * Callers should re-run wall collision on the result.
   */
  public pushPlayerOut(px: number, pz: number): { x: number; z: number } {
    let x = px;
    let z = pz;
    const minDist = NPC_RADIUS + PLAYER_RADIUS;
    for (const n of this.npcs) {
      const dx = x - n.x;
      const dz = z - n.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= minDist) continue;
      if (dist < 1e-4) {
        x = n.x + minDist; // exact overlap: pick any direction
        continue;
      }
      const k = minDist / dist;
      x = n.x + dx * k;
      z = n.z + dz * k;
    }
    return { x, z };
  }

  private chooseNext(n: Npc, maze: MazeData) {
    const options = getOpenNeighbors(maze, n.row, n.col);
    if (options.length === 0) return;
    // Prefer not to turn straight back unless in a dead end
    const forward = options.filter((o) => !(o.row === n.prevRow && o.col === n.prevCol));
    const pool = forward.length > 0 ? forward : options;
    const pick = pool[Math.floor(this.rng() * pool.length)];
    n.toRow = pick.row;
    n.toCol = pick.col;
    n.t = 0;
    const a = cellCenterToWorld(n.row, n.col, maze.rows, maze.cols, maze.cellSize);
    const b = cellCenterToWorld(pick.row, pick.col, maze.rows, maze.cols, maze.cellSize);
    n.dirX = Math.sign(b.x - a.x);
    n.dirZ = Math.sign(b.z - a.z);
  }

  private resolveHit(px: number, pz: number, yaw: number) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    for (const n of this.npcs) {
      const dx = n.x - px;
      const dz = n.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > HIT_RANGE || dist < 0.001) continue;
      if ((dx * fx + dz * fz) / dist < 0.4) continue; // must be in front of the player
      n.stun = STUN_TIME;
      n.moving = false;
      n.character.setDefending(true); // flinch with arms up
      n.character.setTint(0.6);
    }
  }

  public clear() {
    for (const n of this.npcs) {
      this.scene.remove(n.character.root);
      n.character.dispose();
    }
    this.npcs = [];
    this.pendingHit = -1;
  }

  public dispose() {
    this.clear();
  }
}
