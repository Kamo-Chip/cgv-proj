// src/player.js
import * as THREE from "three";
import { MOVE, WORLD } from "./constants.js";
import { gridToWorld } from "./utils.js";

export class Player {
  constructor(camera, walls, look, hud) {
    this.camera = camera;
    this.walls = walls;
    this.look = look;

    this.vel = new THREE.Vector2(0, 0); // xz
    this.yVel = 0;
    this.yOffset = 0;
    this.grounded = true;

    this.GRAVITY = MOVE.BASE_GRAVITY;
    this.JUMP_V = MOVE.BASE_JUMP_V;

    this.health = 100;
    this.hud = hud;
    this.keys = new Set();
    this.collectedKeys = new Set();

    this.MAX_SPEED = MOVE.MAX_SPEED;
    this.ACCEL = MOVE.ACCEL;

    // head bobbing state
    this.bobPhase = 0;       // oscillation phase
    this.bobOffsetY = 0;    // current vertical bob offset applied to camera
    this.bobAmplitude = 0.08; // max vertical bob in meters
    this.bobSpeed = 10;     // base bob speed multiplier

    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "r",
        ].includes(k) ||
        e.code === "Space"
      )
        e.preventDefault();
      this.keys.add(k);
      if (e.code === "Space") this.tryJump();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  setHealth(h) {
    this.health = Math.max(0, Math.min(100, h));
    if (this.hud) this.hud.updateHealth(this.health);
  }

  tryJump() {
    if (this.grounded) {
      this.yVel = this.JUMP_V;
      this.grounded = false;
    }
  }

  resetToStart(mazeStartGX = 1, mazeStartGY = 1, goalPos) {
    const start = gridToWorld(mazeStartGX, mazeStartGY);
    this.camera.position.set(start.x, WORLD.PLAYER_BASE_H, start.z);
    this.vel.set(0, 0);
    this.yVel = 0;
    this.yOffset = 0;
    this.grounded = true;

    if (goalPos) {
      this.look.yaw =
        Math.atan2(
          this.camera.position.x - goalPos.x,
          this.camera.position.z - goalPos.z
        ) + Math.PI;
      this.look.pitch = 0;
    }
  }

  resetKeys() {
    this.collectedKeys.clear();
  }

  collectKey(keyId) {
    this.collectedKeys.add(keyId);
  }

  hasAllKeys(totalKeys) {
    return this.collectedKeys.size >= totalKeys;
  }

  update(dt) {
    // input axes
    let ax = 0,
      az = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) az += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) az -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) ax += 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) ax -= 1;
    if (ax || az) {
      const len = Math.hypot(ax, az);
      ax /= len;
      az /= len;
    }

    // local directions
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.quaternion
    );
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3()
      .crossVectors(fwd, new THREE.Vector3(0, 1, 0))
      .negate();

    // accelerate
    this.vel.x += (right.x * ax + fwd.x * az) * this.ACCEL * dt;
    this.vel.y += (right.z * ax + fwd.z * az) * this.ACCEL * dt;

    // damping + clamp
    const sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > 0) {
      const damp = Math.max(0, 1 - MOVE.DAMPING * dt);
      this.vel.x *= damp;
      this.vel.y *= damp;
    }
    const sp2 = Math.hypot(this.vel.x, this.vel.y);
    if (sp2 > this.MAX_SPEED) {
      this.vel.x *= this.MAX_SPEED / sp2;
      this.vel.y *= this.MAX_SPEED / sp2;
    }

    // head bobbing: compute a smooth vertical offset when moving on the ground
    const moveSpeed = Math.hypot(this.vel.x, this.vel.y);
    const speedRatio = Math.min(1, moveSpeed / this.MAX_SPEED);
    const isMoving = speedRatio > 0.05 && this.grounded;
    if (isMoving) {
      this.bobPhase += dt * this.bobSpeed * (0.8 + speedRatio);
    } else {
      // slowly decay phase to avoid abrupt jumps when resuming
      this.bobPhase += dt * this.bobSpeed * 0.0;
    }
    const targetBob = isMoving ? Math.sin(this.bobPhase) * this.bobAmplitude * (0.5 + speedRatio) : 0;
    // smooth interpolation towards target
    const lerpT = Math.min(1, 10 * dt);
    this.bobOffsetY += (targetBob - this.bobOffsetY) * lerpT;

    // propose move
    let nx = this.camera.position.x + this.vel.x * dt;
    let nz = this.camera.position.z + this.vel.y * dt;

    // circle (player) vs wall AABB
    const R = WORLD.PLAYER_RADIUS;
    for (const w of this.walls) {
      const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
      const cz = Math.max(w.min.z, Math.min(nz, w.max.z));
      const dx = nx - cx,
        dz = nz - cz,
        d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1e-5;
        const overlap = R - d;
        nx += (dx / d) * overlap;
        nz += (dz / d) * overlap;
      }
    }

    // vertical
    this.yVel += this.GRAVITY * dt;
    this.yOffset += this.yVel * dt;
    if (this.yOffset <= 0) {
      this.yOffset = 0;
      this.yVel = 0;
      this.grounded = true;
    } else this.grounded = false;

    this.camera.position.set(nx, WORLD.PLAYER_BASE_H + this.yOffset + this.bobOffsetY, nz);
  }
}