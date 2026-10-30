/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Drone oscillators & filters
  private droneOscs: OscillatorNode[] = [];
  private droneFilter: BiquadFilterNode | null = null;
  private isDronePlaying = false;

  // Portal proximity hum
  private portalHumOsc: OscillatorNode | null = null;
  private portalHumGain: GainNode | null = null;

  // Settings
  private soundVolume = 0.8;
  private musicVolume = 0.6;
  private isMuted = false;
  private lastFootstepTime = 0;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.soundVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.startAmbientDrone();
      this.initPortalHum();
    } catch {
      // Audio not supported or blocked
    }
  }

  public ensureContext() {
    if (!this.ctx) {
      this.initContext();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolumes(sound: number, music: number, muted: boolean) {
    this.soundVolume = Math.max(0, Math.min(1, sound));
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.isMuted = muted;

    if (this.ctx && this.masterGain && this.sfxGain && this.musicGain) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, t, 0.05);
      this.sfxGain.gain.setTargetAtTime(this.soundVolume, t, 0.05);
      this.musicGain.gain.setTargetAtTime(this.musicVolume, t, 0.05);
    }
  }

  /**
   * Deep mystical ambient drone with slow filter sweep
   */
  private startAmbientDrone() {
    if (!this.ctx || !this.musicGain || this.isDronePlaying) return;
    this.isDronePlaying = true;

    // Frequencies: D2 (73.4Hz), A2 (110Hz), D3 (146.8Hz), F#3 (185Hz)
    const freqs = [73.42, 110.0, 146.83, 220.0];

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    this.droneFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);
    this.droneFilter.connect(this.musicGain);

    // LFO to slowly sweep the filter cutoff (creates breathing mysterious atmosphere)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 12-second wave
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(140, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);
    lfo.start();

    this.droneOscs = freqs.map((freq) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime);

      const oscGain = this.ctx!.createGain();
      oscGain.gain.setValueAtTime(0.12, this.ctx!.currentTime);

      osc.connect(oscGain);
      oscGain.connect(this.droneFilter!);
      osc.start();
      return osc;
    });
  }

  /**
   * Continuous resonant portal hum
   */
  private initPortalHum() {
    if (!this.ctx || !this.sfxGain) return;

    this.portalHumOsc = this.ctx.createOscillator();
    this.portalHumOsc.type = 'sine';
    this.portalHumOsc.frequency.setValueAtTime(130, this.ctx.currentTime);

    this.portalHumGain = this.ctx.createGain();
    this.portalHumGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.portalHumOsc.connect(this.portalHumGain);
    this.portalHumGain.connect(this.sfxGain);
    this.portalHumOsc.start();
  }

  /**
   * Set the portal ambient sound state.
   * Produces a constant, non-distance-based ambient hum only when active (within line of sight inside same chamber).
   * Completely silent otherwise.
   */
  public setPortalActive(active: boolean) {
    if (!this.ctx || !this.portalHumGain || !this.portalHumOsc) return;

    // Pitch is strictly constant (no distance modulation)
    this.portalHumOsc.frequency.setValueAtTime(130, this.ctx.currentTime);

    // Volume is strictly constant (no distance ramping)
    const targetGain = active ? 0.22 : 0;
    this.portalHumGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
  }

  /**
   * @deprecated Removed distance-based audio to comply with unassisted navigation rules.
   */
  public updatePortalProximity(_distanceToExit: number) {
    // No-op: distance-based volume/pitch modulation has been removed
  }

  /**
   * Footstep sound on ancient stone
   */
  public playFootstep(isSprinting: boolean) {
    if (!this.ctx || !this.sfxGain) return;
    const now = performance.now();
    const minInterval = isSprinting ? 280 : 420;
    if (now - this.lastFootstepTime < minInterval) return;
    this.lastFootstepTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isSprinting ? 95 : 80, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.06);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, t);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * Mystical victory chime on completing the labyrinth
   */
  public playVictoryFanfare() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Harmonic pentatonic arpeggio: D4, F#4, A4, D5, F#5
    const notes = [293.66, 369.99, 440.0, 587.33, 739.99];

    notes.forEach((freq, idx) => {
      const noteTime = t + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.25, noteTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.2);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(noteTime);
      osc.stop(noteTime + 1.3);
    });
  }

  /**
   * UI Click sound
   */
  public playUIClick() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.04);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  public dispose() {
    this.droneOscs.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    });
    this.droneOscs = [];
    if (this.portalHumOsc) {
      try {
        this.portalHumOsc.stop();
        this.portalHumOsc.disconnect();
      } catch {
        // ignore
      }
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
  }
}
