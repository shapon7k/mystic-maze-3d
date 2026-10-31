/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import skin1Url from '../assets/skins/skin1.png';
import skin2Url from '../assets/skins/skin2.png';
import skin3Url from '../assets/skins/skin3.png';
import skin4Url from '../assets/skins/skin4.png';
import skin5Url from '../assets/skins/skin5.png';
import skin6Url from '../assets/skins/skin6.png';
import frostSwordUrl from '../assets/weapons/frost_sword.png';
import katanaUrl from '../assets/weapons/katana.png';
import bowUrl from '../assets/weapons/bow.png';

/** The bundled Minecraft-layout (64x64) character skins. Bundled in the app: works offline. */
export const SKIN_URLS: string[] = [skin1Url, skin2Url, skin3Url, skin4Url, skin5Url, skin6Url];
export const SKIN_COUNT = SKIN_URLS.length;
export const SKIN_NAMES = ['Skin 1', 'Skin 2', 'Skin 3', 'Skin 4', 'Skin 5', 'Skin 6'];

export interface WeaponDef {
  name: string;
  /** Sprite image; null = the built-in blocky diamond sword. */
  url: string | null;
  /** Sprite edge length in metres (the sprite is drawn along its bottom-left -> top-right diagonal). */
  size: number;
  /** Where the hand grips, as a fraction of the diagonal measured from the handle end. */
  grip: number;
}

export const WEAPONS: WeaponDef[] = [
  { name: 'Diamond Sword', url: null, size: 0, grip: 0 },
  { name: 'Frost Sword', url: frostSwordUrl, size: 0.55, grip: 0.16 },
  { name: 'Katana', url: katanaUrl, size: 0.66, grip: 0.14 },
  { name: 'Bow', url: bowUrl, size: 0.55, grip: 0.5 },
];
export const WEAPON_COUNT = WEAPONS.length;

const weaponCache = new Map<number, THREE.Texture>();
export function getWeaponTexture(index: number): THREE.Texture | null {
  const w = WEAPONS[index];
  if (!w || !w.url) return null;
  const hit = weaponCache.get(index);
  if (hit) return hit;
  try {
    const tex = new THREE.TextureLoader().load(w.url);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    weaponCache.set(index, tex);
    return tex;
  } catch {
    return null;
  }
}

const cache = new Map<number, THREE.Texture>();

/** Shared, pixel-crisp texture for a skin index (cached; characters never dispose it). */
export function getSkinTexture(index: number): THREE.Texture | null {
  const i = ((Math.floor(index) % SKIN_COUNT) + SKIN_COUNT) % SKIN_COUNT;
  const hit = cache.get(i);
  if (hit) return hit;
  try {
    const tex = new THREE.TextureLoader().load(SKIN_URLS[i]);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    cache.set(i, tex);
    return tex;
  } catch {
    return null; // callers fall back to the flat-colour palette model
  }
}
