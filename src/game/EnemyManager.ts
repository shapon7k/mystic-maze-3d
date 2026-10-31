/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { MazeData } from '../types/game';
import { PlayerCharacter, CharacterPalette } from './PlayerCharacter';

const ENEMY_PALETTE: CharacterPalette = {
  skin: 0x5f7f55, // mossy green
  hair: 0x3f5a3a,
  shirt: 0x2d5a5a,
  pants: 0x2b2b5e,
  shoe: 0x2a2a2a,
  eye: 0xff2020, // glowing red eyes
};

const ENEMY_COUNT = 4;
const ENEMY_HP = 50;
const PLAYER_HIT_DAMAGE = 25;
const DETECT_RANGE = 14; // starts chasing inside this distance
const LOSE_RANGE = 22; // gives up beyond this distance
const ATTACK_RANGE = 1.5;
const STRIKE_RANGE = 1.95; // must still be this close when the swing lands
const SWING_DELAY = 0.22;
const ATTACK_COOLDOWN = 1.4;
const CHASE_SPEED = 2.6;
const WANDER_SPEED = 1.2;
const ENEMY_DAMAGE = 10;
const RESPAWN_TIME = 8;
const HIT_RANGE = 2.4;
const HIT_DELAY = 0.18;
const ENEMY_RADIUS = 0.4;
const PLAYER_RADIUS = 0.45;

interface Enemy {
  character: PlayerCharacter;
  spawnX: number;
  spawnZ: number;
  x: number;
  z: number;
  hp: number;
  chasing: boolean;
  tx: number;
  tz: number;
  hasTarget: boolean;
  wait: number;
  cooldown: number;
  swing: number; // time until the swing lands, -1 = not swinging
  stun: number;
  deadT: number; // > 0 while dead (counts down to respawn)
  dirX: number;
  dirZ: number;
  moving: boolean;
}

export type ResolveFn = (x: number, z: number) => { x: number; z: number };

/**
 * Hostile blocky enemies for the Playground. They wander, chase the player when they notice him,
 * strike at close range, can be killed with Attack (two hits) and respawn after a while.
 * Positions are free-roaming but always pass through `resolve` so they never leave the arena.
 */
export class EnemyManager {
  private enemies: Enemy[] = [];
  private arenaHalf = 30;
  private pendingHit = -1;
  private rngState = 12345;

  constructor(private scene: THREE.Scene, private resolve: ResolveFn) {}

  public get count() {
    return this.enemies.length;
  }
  public get aliveCount() {
    return this.enemies.filter((e) => e.deadT <= 0).length;
  }
  public getPositions(): { x: number; z: number; alive: boolean }[] {
    return this.enemies.map((e) => ({ x: e.x, z: e.z, alive: e.deadT <= 0 }));
  }

  private rand() {
    // small deterministic LCG: behaviour is repeatable and needs no Math.random
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  public spawn(maze: MazeData) {
    this.clear();
    this.arenaHalf = (maze.cols * maze.cellSize) / 2;
    const m = this.arenaHalf * 0.65;
    const points = [
      [-m, -m], [m, -m], [-m, m * 0.2], [m, m * 0.2],
    ];
    for (let i = 0; i < ENEMY_COUNT; i++) {
      const [x, z] = points[i % points.length];
      const character = new PlayerCharacter(ENEMY_PALETTE);
      character.sword.visible = false;
      this.scene.add(character.root);
      this.enemies.push({
        character, spawnX: x, spawnZ: z, x, z, hp: ENEMY_HP,
        chasing: false, tx: x, tz: z, hasTarget: false, wait: this.rand() * 2,
        cooldown: 0, swing: -1, stun: 0, deadT: 0, dirX: 0, dirZ: 1, moving: false,
      });
    }
  }

  /** Puts every enemy back to full health at its spawn point (used when the player is defeated). */
  public resetAll() {
    for (const e of this.enemies) this.revive(e, e.spawnX, e.spawnZ);
    this.pendingHit = -1;
  }

  private revive(e: Enemy, x: number, z: number) {
    e.x = x;
    e.z = z;
    e.hp = ENEMY_HP;
    e.deadT = 0;
    e.stun = 0;
    e.swing = -1;
    e.cooldown = 1;
    e.chasing = false;
    e.hasTarget = false;
    e.character.root.visible = true;
    e.character.setTint(0);
  }

  /** Called when the player swings; resolved a moment later, mid-swing. */
  public queueHit() {
    this.pendingHit = HIT_DELAY;
  }

  /**
   * Advances all enemies. Returns the raw damage dealt to the player this frame
   * (the caller applies any Defend reduction).
   */
  public update(delta: number, px: number, pz: number, playerYaw: number): number {
    let damage = 0;

    if (this.pendingHit >= 0) {
      this.pendingHit -= delta;
      if (this.pendingHit < 0) this.resolveHit(px, pz, playerYaw);
    }

    for (const e of this.enemies) {
      if (e.deadT > 0) {
        e.deadT -= delta;
        if (e.deadT <= 0) this.respawnAwayFrom(e, px, pz);
        continue;
      }

      const dx = px - e.x;
      const dz = pz - e.z;
      const dist = Math.hypot(dx, dz);
      e.cooldown -= delta;
      e.moving = false;
      let faceX = e.dirX;
      let faceZ = e.dirZ;

      if (e.stun > 0) {
        e.stun -= delta;
        if (e.stun <= 0) e.character.setTint(0);
      } else {
        // Notice / lose the player
        if (!e.chasing && dist < DETECT_RANGE) e.chasing = true;
        else if (e.chasing && dist > LOSE_RANGE) e.chasing = false;

        if (e.chasing) {
          const ux = dx / (dist || 1);
          const uz = dz / (dist || 1);
          faceX = ux;
          faceZ = uz;
          if (dist > ATTACK_RANGE) {
            this.step(e, ux, uz, CHASE_SPEED, delta);
          } else if (e.cooldown <= 0 && e.swing < 0) {
            e.swing = SWING_DELAY;
            e.cooldown = ATTACK_COOLDOWN;
            e.character.triggerAttack();
          }
        } else {
          if (e.wait > 0) {
            e.wait -= delta;
          } else {
            if (!e.hasTarget) {
              const span = this.arenaHalf - 3;
              e.tx = (this.rand() * 2 - 1) * span;
              e.tz = (this.rand() * 2 - 1) * span;
              e.hasTarget = true;
            }
            const tdx = e.tx - e.x;
            const tdz = e.tz - e.z;
            const td = Math.hypot(tdx, tdz);
            if (td < 0.6) {
              e.hasTarget = false;
              e.wait = 0.5 + this.rand() * 2.5;
            } else {
              faceX = tdx / td;
              faceZ = tdz / td;
              this.step(e, faceX, faceZ, WANDER_SPEED, delta);
            }
          }
        }

        // A swing lands after its wind-up, only if the player is still in reach
        if (e.swing >= 0) {
          e.swing -= delta;
          if (e.swing < 0) {
            e.swing = -1;
            if (dist < STRIKE_RANGE) damage += ENEMY_DAMAGE;
          }
        }
      }

      // Keep enemies from stacking on each other
      for (const o of this.enemies) {
        if (o === e || o.deadT > 0) continue;
        const ox = e.x - o.x;
        const oz = e.z - o.z;
        const od = Math.hypot(ox, oz);
        const min = ENEMY_RADIUS * 2;
        if (od < min && od > 1e-4) {
          const r = this.resolve(e.x + (ox / od) * (min - od) * 0.5, e.z + (oz / od) * (min - od) * 0.5);
          e.x = r.x;
          e.z = r.z;
        }
      }

      e.dirX = faceX;
      e.dirZ = faceZ;
      // isMoving=true with speed 0 only turns the body (idle pose) so enemies face the player while striking
      const turning = e.moving || e.chasing;
      e.character.update(
        delta, e.x, e.z, 0,
        e.moving ? (e.chasing ? CHASE_SPEED : WANDER_SPEED) : 0,
        turning, false, faceX, faceZ,
        false, 2.4, 1.0
      );
    }
    return damage;
  }

  private step(e: Enemy, ux: number, uz: number, speed: number, delta: number) {
    const r = this.resolve(e.x + ux * speed * delta, e.z + uz * speed * delta);
    e.x = r.x;
    e.z = r.z;
    e.moving = true;
  }

  private respawnAwayFrom(e: Enemy, px: number, pz: number) {
    const span = this.arenaHalf - 3;
    let x = e.spawnX;
    let z = e.spawnZ;
    for (let i = 0; i < 12; i++) {
      const cx = (this.rand() * 2 - 1) * span;
      const cz = (this.rand() * 2 - 1) * span;
      if (Math.hypot(cx - px, cz - pz) > 16) {
        x = cx;
        z = cz;
        break;
      }
    }
    this.revive(e, x, z);
  }

  private resolveHit(px: number, pz: number, yaw: number) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    for (const e of this.enemies) {
      if (e.deadT > 0) continue;
      const dx = e.x - px;
      const dz = e.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > HIT_RANGE || dist < 0.001) continue;
      if ((dx * fx + dz * fz) / dist < 0.4) continue;
      e.hp -= PLAYER_HIT_DAMAGE;
      e.swing = -1; // being hit interrupts its attack
      if (e.hp <= 0) {
        e.deadT = RESPAWN_TIME;
        e.character.root.visible = false;
        e.chasing = false;
      } else {
        e.stun = 0.5;
        e.character.setTint(0.6);
        // Knock back away from the player
        const r = this.resolve(e.x + (dx / dist) * 0.9, e.z + (dz / dist) * 0.9);
        e.x = r.x;
        e.z = r.z;
      }
    }
  }

  /** Enemies are solid: pushes the player out of any overlapping living enemy. */
  public pushPlayerOut(px: number, pz: number): { x: number; z: number } {
    let x = px;
    let z = pz;
    const minDist = ENEMY_RADIUS + PLAYER_RADIUS;
    for (const e of this.enemies) {
      if (e.deadT > 0) continue;
      const dx = x - e.x;
      const dz = z - e.z;
      const d = Math.hypot(dx, dz);
      if (d >= minDist) continue;
      if (d < 1e-4) {
        x = e.x + minDist;
        continue;
      }
      x = e.x + (dx / d) * minDist;
      z = e.z + (dz / d) * minDist;
    }
    return { x, z };
  }

  public clear() {
    for (const e of this.enemies) {
      this.scene.remove(e.character.root);
      e.character.dispose();
    }
    this.enemies = [];
    this.pendingHit = -1;
  }

  public dispose() {
    this.clear();
  }
}
