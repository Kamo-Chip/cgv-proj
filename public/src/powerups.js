// src/powerups.js
import * as THREE from "three";
import { POWERUP, MOVE } from "./constants.js";
import { gridToWorld } from "./utils.js";

// Registry of powerup types
const ENEMY_FREEZE_DURATION = 10; // seconds, adjust as needed
const SPEEDBOOST_DURATION = 10; // seconds
const SPEEDBOOST_MULT = 2.5;

const PowerupTypes = {
  jump: {
    color: 0x7c9cff,
    emissive: 0x2a49ff,
    duration: POWERUP.DURATION,
    apply(player) {
      player.GRAVITY = MOVE.BASE_GRAVITY * POWERUP.GRAVITY_MULT;
      player.JUMP_V = MOVE.BASE_JUMP_V * POWERUP.JUMP_MULT;
    },
    clear(player) {
      player.GRAVITY = MOVE.BASE_GRAVITY;
      player.JUMP_V = MOVE.BASE_JUMP_V;
    },
    hud: {
      el: document.getElementById("jumpHud"),
      timer: document.getElementById("jumpTimer"),
      show(timeLeft) {
        this.el.style.display = "inline-block";
        this.timer.textContent = timeLeft.toFixed(1);
      },
      hide() {
        this.el.style.display = "none";
      },
    },
  },
  freeze: {
    color: 0xcccccc,
    emissive: 0x555555,
    duration: ENEMY_FREEZE_DURATION,
    apply(player, { enemiesCtl }) {
      if (!enemiesCtl) return;
      enemiesCtl.setFrozen(true);
    },
    clear(player, { enemiesCtl }) {
      if (!enemiesCtl) return;
      enemiesCtl.setFrozen(false);
    },
    hud: {
      el: document.getElementById("freezeHud"),
      timer: document.getElementById("freezeTimer"),
      show(timeLeft) {
        this.el.style.display = "inline-block";
        this.timer.textContent = timeLeft.toFixed(1);
      },
      hide() {
        this.el.style.display = "none";
      },
    },
  },
  speed: {
    color: 0x4dff7c,
    emissive: 0x1bff66,
    duration: SPEEDBOOST_DURATION,
    apply(player) {
      player.MAX_SPEED = player.MAX_SPEED * SPEEDBOOST_MULT;
      player.ACCEL = player.ACCEL * SPEEDBOOST_MULT;
    },
    clear(player) {
      player.MAX_SPEED = MOVE.MAX_SPEED;
      player.ACCEL = MOVE.ACCEL;
    },
    hud: {
      el: document.getElementById("speedHud"),
      timer: document.getElementById("speedTimer"),
      show(timeLeft) {
        this.el.style.display = "inline-block";
        this.timer.textContent = timeLeft.toFixed(1);
      },
      hide() {
        this.el.style.display = "none";
      },
    },
  },
  health: {
    color: 0xff0000,
    emissive: 0xff0000,
    duration: 0.1, // instant effect, short timer for removal
    apply(player) {
      player.setHealth(player.health + 10);
    },
    clear() {}, // nothing to clear
    hud: null, // no HUD
  },
};

class Powerup {
  constructor(type, gx, gy, scene) {
    this.type = type;
    this.gx = gx;
    this.gy = gy;
    this.taken = false;
    this.mesh = this._createMesh(type, gx, gy);
    scene.add(this.mesh);
  }
  _createMesh(type, gx, gy) {
    const kind =
      Object.keys(PowerupTypes).find((k) => PowerupTypes[k] === type) ||
      type.name ||
      "generic";
    const w = gridToWorld(gx, gy);

    // Shared material base
    const baseMat = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.emissive,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.2,
    });

    const group = new THREE.Group();

    if (kind === "jump") {
      // A little core with an upward arrow to suggest jump
      const coreGeo = new THREE.SphereGeometry(0.18, 16, 12);
      const core = new THREE.Mesh(coreGeo, baseMat);
      core.castShadow = true;
      group.add(core);

      const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.42, 12);
      const shaft = new THREE.Mesh(shaftGeo, baseMat);
      shaft.position.y = 0.28;
      shaft.castShadow = true;
      group.add(shaft);

      const tipGeo = new THREE.ConeGeometry(0.08, 0.18, 12);
      const tip = new THREE.Mesh(tipGeo, baseMat);
      tip.position.y = 0.56;
      tip.castShadow = true;
      group.add(tip);
    } else if (kind === "freeze") {
      // Crystal-like octahedron with spikes
      const coreGeo = new THREE.OctahedronGeometry(0.22, 0);
      const core = new THREE.Mesh(coreGeo, baseMat);
      core.castShadow = true;
      group.add(core);

      const spikeGeo = new THREE.ConeGeometry(0.06, 0.18, 12);
      const spikeDirs = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
      ];
      for (const dir of spikeDirs) {
        const s = new THREE.Mesh(spikeGeo, baseMat);
        // orient cone so its tip points away from center
        s.lookAt(dir);
        // move it slightly away from center
        s.position.copy(dir.clone().multiplyScalar(0.36));
        s.castShadow = true;
        group.add(s);
      }
    } else if (kind === "speed") {
      // Sleek ring with winglets to suggest motion
      const torusGeo = new THREE.TorusGeometry(0.22, 0.06, 12, 48);
      const torus = new THREE.Mesh(torusGeo, baseMat);
      torus.rotation.x = Math.PI / 2;
      torus.castShadow = true;
      group.add(torus);

      const wingGeo = new THREE.BoxGeometry(0.42, 0.06, 0.12);
      for (let i = 0; i < 2; i++) {
        const wing = new THREE.Mesh(wingGeo, baseMat);
        wing.position.x = i === 0 ? 0.28 : -0.28;
        wing.position.y = 0.05;
        wing.rotation.z = i === 0 ? -0.35 : 0.35;
        wing.castShadow = true;
        group.add(wing);
      }
    } else if (kind === "health") {
      // Heart-shaped 3D model
      const heartShape = new THREE.Shape();
      heartShape.moveTo(0, -0.12);
      heartShape.bezierCurveTo(0.06, -0.28, 0.28, -0.28, 0.28, -0.04);
      heartShape.bezierCurveTo(0.28, 0.14, 0.14, 0.26, 0, 0.36);
      heartShape.bezierCurveTo(-0.14, 0.26, -0.28, 0.14, -0.28, -0.04);
      heartShape.bezierCurveTo(-0.28, -0.28, -0.06, -0.28, 0, -0.12);

      const extrudeSettings = {
        depth: 0.12,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 3,
      };
      const heartGeo = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
      if (heartGeo.center) {
        heartGeo.center();
      } else {
        heartGeo.computeBoundingBox();
        const c = heartGeo.boundingBox.getCenter(new THREE.Vector3()).negate();
        heartGeo.translate(c.x, c.y, c.z);
      }

      const heartMat = new THREE.MeshStandardMaterial({
        color: type.color,
        emissive: type.emissive,
        emissiveIntensity: 0.9,
        roughness: 0.35,
        metalness: 0.05,
      });
      const heart = new THREE.Mesh(heartGeo, heartMat);
      heart.castShadow = true;
      // ensure top of heart points up and sit slightly above ground
      heart.rotation.x = Math.PI; // flip so top aligns correctly
      heart.position.y = 0.02;
      heart.scale.setScalar(1.0);
      group.add(heart);

      // subtle glow ring underneath
      const glowGeo = new THREE.RingGeometry(0.28, 0.36, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: type.color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = -0.06;
      group.add(glow);
    } else {
      // fallback: torus knot like before
      const geo = new THREE.TorusKnotGeometry(0.3, 0.09, 64, 8);
      const fallback = new THREE.Mesh(geo, baseMat);
      fallback.castShadow = true;
      group.add(fallback);
    }

    // Position the whole group in world space
    group.position.set(w.x, 0.6, w.z);
    return group;
  }
}

export function initPowerups(scene, maze, enemiesCtl) {
  const powerups = [];
  const active = [];

  function scatter() {
    // remove old
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;

    const H = maze.length,
      W = maze[0].length;
    const cells = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++)
        if (maze[y][x] === 1) cells.push({ x, y });

    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    let placed = 0;
    const minCellGap = 3;
    const chosen = [];
    const types = Object.keys(PowerupTypes);
    for (const c of cells) {
      if (placed >= POWERUP.COUNT) break;
      const ok = chosen.every(
        (d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= minCellGap
      );
      if (!ok) continue;
      chosen.push(c);
      // cycle types for demo, or randomize
      const typeName = types[placed % types.length];
      powerups.push(new Powerup(PowerupTypes[typeName], c.x, c.y, scene));
      placed++;
    }
  }

  function update(dt, player, camera) {
    // spin/float
    for (const p of powerups) {
      if (!p.taken) {
        p.mesh.rotation.y += dt * 1.5;
        p.mesh.position.y =
          0.55 + Math.sin(performance.now() * 0.003 + p.gx * 13.3) * 0.05;
      }
    }

    // pickup
    for (const p of powerups) {
      if (p.taken) continue;
      const d = Math.hypot(
        camera.position.x - p.mesh.position.x,
        camera.position.z - p.mesh.position.z
      );
      if (d <= POWERUP.PICKUP_RADIUS) {
        p.taken = true;
        p.mesh.scale.setScalar(1.4);
        setTimeout(() => scene.remove(p.mesh), 80);
        activatePowerup(p.type, player);
      }
    }
    // timers
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.timeLeft -= dt;
      if (a.type.hud) a.type.hud.show(a.timeLeft);
      if (a.timeLeft <= 0) {
        a.type.clear(player, { enemiesCtl });
        if (a.type.hud) a.type.hud.hide();
        active.splice(i, 1);
      }
    }
  }
  function activatePowerup(type, player) {
    // If already active, reset timer
    const found = active.find((a) => a.type === type);
    if (found) {
      found.timeLeft = type.duration;
    } else {
      type.apply(player, { enemiesCtl });
      active.push({ type, timeLeft: type.duration });
      if (type.hud) type.hud.show(type.duration);
    }
  }
  function reset(player) {
    for (const a of active) {
      a.type.clear(player, { enemiesCtl });
      if (a.type.hud) a.type.hud.hide();
    }
    active.length = 0;
    scatter();
  }

  return { powerups, update, reset, scatter };
}
