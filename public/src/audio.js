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
