/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import skin1Url from '../assets/skins/skin1.png';
import skin2Url from '../assets/skins/skin2.png';
import skin3Url from '../assets/skins/skin3.png';

/** The three bundled Minecraft-layout (64x64) character skins. Bundled in the app: works offline. */
export const SKIN_URLS: string[] = [skin1Url, skin2Url, skin3Url];
export const SKIN_COUNT = SKIN_URLS.length;
export const SKIN_NAMES = ['Skin 1', 'Skin 2', 'Skin 3'];

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
