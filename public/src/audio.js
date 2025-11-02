// src/audio.js
// Simple AudioManager using Web Audio API. Scaffolding for loading sounds,
// spatialized playback, and volume channels (master, sfx, music).

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;

    this.buffers = new Map();
    this.enabled = true;

    // Music control
    this._music = {
      name: null,
      src: null,
      gainNode: null,
      baseVolume: 1.0,
      muted: false,
    };
  }

  async init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // Create mixer
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();

    // default volumes
    this.masterGain.gain.value = 1.0;
    this.sfxGain.gain.value = 1.0;
    this.musicGain.gain.value = 1.0;

    // routing
    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  async loadSound(name, url) {
    await this.init();
    if (this.buffers.has(name)) return this.buffers.get(name);
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(ab.slice(0));
    this.buffers.set(name, buf);
    return buf;
  }

  async loadSounds(map) {
    const promises = [];
    for (const [name, url] of Object.entries(map)) {
      promises.push(this.loadSound(name, url));
    }
    return Promise.all(promises);
  }

  _createSource(buffer, destGain) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 1.0;
    src.connect(gain);
    gain.connect(destGain);
    return { src, gain };
  }

  play(name, { volume = 1.0, loop = false, isMusic = false } = {}) {
    if (!this.enabled || !this.ctx || !this.buffers.has(name)) return;
    const buffer = this.buffers.get(name);
    const destGain = isMusic ? this.musicGain : this.sfxGain;
    const { src, gain } = this._createSource(buffer, destGain);
    gain.gain.value = volume;
    src.loop = loop;
    src.start();
    // return node for optional stop control
    return src;
  }

  // Spatialized playback: position is THREE.Vector3-like {x,y,z}, listenerPos optional
  playSpatial(name, position, { volume = 1.0, loop = false } = {}) {
    if (!this.enabled || !this.ctx || !this.buffers.has(name)) return;
    const buffer = this.buffers.get(name);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 1000;
    panner.rolloffFactor = 1;
    panner.setPosition(position.x, position.y, position.z);

    src.connect(gain);
    gain.connect(panner);
    panner.connect(this.sfxGain);

    src.loop = loop;
    src.start();
    return { src, panner, gain };
  }

  setMasterVolume(v) {
    if (!this.masterGain) return;
    this.masterGain.gain.value = v;
  }
  setSfxVolume(v) {
    if (!this.sfxGain) return;
    this.sfxGain.gain.value = v;
  }
  setMusicVolume(v) {
    if (!this.musicGain) return;
    this.musicGain.gain.value = v;
  }

  // --- Music helpers ---
  _fadeGain(gainNode, to, seconds = 0.3) {
    if (!this.ctx || !gainNode) return;
    const now = this.ctx.currentTime;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(Math.max(0, to), now + Math.max(0, seconds));
    } catch (e) {
      // fallback without scheduler
      gainNode.gain.value = to;
    }
  }

  stopMusic({ fade = 0.25 } = {}) {
    if (!this._music.src) return;
    const src = this._music.src;
    const gainNode = this._music.gainNode;
    if (gainNode && fade > 0) this._fadeGain(gainNode, 0, fade);
    try {
      // Stop slightly after fade to avoid click
      const when = this.ctx ? this.ctx.currentTime + Math.max(0, fade) + 0.01 : 0;
      src.stop(when);
    } catch (e) {
      try { src.stop(); } catch (_) {}
    }
    this._music.name = null;
    this._music.src = null;
    this._music.gainNode = null;
  }

  muteMusic(muted, { fade = 0.2 } = {}) {
    this._music.muted = !!muted;
    if (!this._music.gainNode) return;
    const target = muted ? 0 : this._music.baseVolume;
    this._fadeGain(this._music.gainNode, target, fade);
  }

  playMusic(name, { volume = 0.6, loop = true, fade = 0.4 } = {}) {
    if (!this.enabled || !this.ctx || !this.buffers.has(name)) return;

    // If same track is already playing, just unmute/fade to volume
    if (this._music.name === name && this._music.src) {
      this._music.baseVolume = volume;
      if (this._music.gainNode) this._fadeGain(this._music.gainNode, volume, fade);
      this._music.muted = false;
      return this._music.src;
    }

    // Otherwise stop any existing music and start new one
    if (this._music.src) this.stopMusic({ fade: Math.min(fade, 0.2) });

    const buffer = this.buffers.get(name);
    const { src, gain } = this._createSource(buffer, this.musicGain);
    src.loop = loop;
    // start from silent and fade in
    gain.gain.value = 0.0001;
    try { src.start(); } catch (e) { /* ignore */ }
    this._fadeGain(gain, volume, fade);

    this._music = {
      name,
      src,
      gainNode: gain,
      baseVolume: volume,
      muted: false,
    };

    return src;
  }

  suspend() {
    if (!this.ctx) return;
    return this.ctx.suspend();
  }
  resume() {
    if (!this.ctx) return;
    return this.ctx.resume();
  }

  toggleEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) this.resume();
    else this.suspend();
  }
}

// Shared instance to be imported by other modules for easy access
export const audio = new AudioManager();
