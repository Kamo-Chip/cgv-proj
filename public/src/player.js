// src/player.js
import * as THREE from "three";
import { MOVE, WORLD, POWERUP } from "./constants.js";
import { gridToWorld } from "./utils.js";
import { audio } from "./audio.js";

export class Player {
  constructor(camera, walls, look, hud) {
    this.camera = camera;
    this.walls = walls;
    this.look = look;

    this.vel = new THREE.Vector2(0, 0); // xz
    this.yVel = 0;
    this.yOffset = 0;
    this.grounded = true;

    this.GRAVITY = MOVE.BASE_GRAVITY
    this.JUMP_V = MOVE.BASE_JUMP_V;

    this.health = 100;
    this.hud = hud;
    this.keys = new Set();
    this.collectedKeys = new Set();

    this.MAX_SPEED = MOVE.MAX_SPEED;
    this.ACCEL = MOVE.ACCEL;

    // head bobbing state
    this.bobPhase = 0; // oscillation phase
    this.bobOffsetY = 0; // current vertical bob offset applied to camera
    this.bobAmplitude = 0.08; // max vertical bob in meters
    this.bobSpeed = 10; // base bob speed multiplier

    this.stepTimer = 0; // cooldown until next eligible step
    this.stepMinInterval = 0.2; // fastest cadence (seconds) at max speed
    this.stepMaxInterval = 0.5; // slowest cadence (seconds) at walk start
    this._bobPrevSin = 0; // to detect left/right step zero-crossings

    // Bind input handlers so we can remove them on dispose (prevents duplicates across level changes)
    this._onKeyDown = (e) => {
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
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());

    addEventListener("keydown", this._onKeyDown);
    addEventListener("keyup", this._onKeyUp);
  }

  setHealth(h) {
    this.health = Math.max(0, Math.min(100, h));
    if (this.hud) this.hud.updateHealth(this.health);
  }

  tryJump() {
    if (this.grounded) {
      try {
        if (this.JUMP_V === MOVE.BASE_JUMP_V * POWERUP.JUMP_MULT) {
          audio.play("player_jump_high", { volume: 0.9 });
        } else {
          audio.play("player_jump", { volume: 0.9 });
        }
      } catch (e) {
        console.error("Failed to play player_jump sound:", e);
      }
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
    let speedRatio;

    if (this.MAX_SPEED === MOVE.MAX_SPEED * 2.5) {
      speedRatio = Math.min(1, moveSpeed);
    } else {
      speedRatio = Math.min(1, moveSpeed / this.MAX_SPEED);
    }
    const isMoving = speedRatio > 0.05 && this.grounded;
    if (isMoving) {
      this.bobPhase += dt * this.bobSpeed * (0.8 + speedRatio);
    } else {
      // slowly decay phase to avoid abrupt jumps when resuming
      this.bobPhase += dt * this.bobSpeed * 0.0;
    }
    const targetBob = isMoving
      ? Math.sin(this.bobPhase) * this.bobAmplitude * (0.5 + speedRatio)
      : 0;
    // smooth interpolation towards target
    const lerpT = Math.min(1, 10 * dt);
    this.bobOffsetY += (targetBob - this.bobOffsetY) * lerpT;

    // --- footstep SFX tied to bobbing zero-crossings ---
    this.stepTimer = Math.max(0, this.stepTimer - dt);

    // Only step when actually moving and on the ground
    if (isMoving && this.grounded) {
      const bobSin = Math.sin(this.bobPhase);

      // Two steps per bob cycle: trigger when passing through zero (left/right)
      const crossedUp = this._bobPrevSin <= 0 && bobSin > 0; // step A
      const crossedDown = this._bobPrevSin >= 0 && bobSin < 0; // step B
      const crossed = crossedUp || crossedDown;

      if (crossed && this.stepTimer <= 0) {
        // cadence scales with speed: faster speed -> shorter interval
        const interval =
          this.stepMaxInterval -
          (this.stepMaxInterval - this.stepMinInterval) * speedRatio;
        this.stepTimer = interval;

        // small volume variance with speed (and slight randomness)
        const baseVol = 0.35 + 0.35 * speedRatio; // 0.35..0.70
        const vol = Math.min(1, baseVol * (0.9 + Math.random() * 0.2));

        try {
          // If you have multiple footstep clips, you can randomize keys here.
          audio.play(Math.random() < 0.5 ? "player_step_1" : "player_step_2", {
            volume: vol,
          });
        } catch (e) {
          console.warn("Footstep sound failed:", e);
        }
      }

      this._bobPrevSin = bobSin;
    } else {
      // reset so we don't get a stray step when resuming
      this._bobPrevSin = 0;
      this.stepTimer = 0;
    }

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

    this.camera.position.set(
      nx,
      WORLD.PLAYER_BASE_H + this.yOffset + this.bobOffsetY,
      nz
    );
  }

  // Allow callers to clean up event listeners when recreating the Player
  dispose() {
    try {
      if (this._onKeyDown) removeEventListener("keydown", this._onKeyDown);
    } catch (e) {}
    try {
      if (this._onKeyUp) removeEventListener("keyup", this._onKeyUp);
    } catch (e) {}
  }
}
