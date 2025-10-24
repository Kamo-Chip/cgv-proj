// src/powerups.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { POWERUP, MOVE } from "./constants.js";
import { gridToWorld } from "./utils.js";
import { audio } from "./audio.js";

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
    // Use GLTF models instead of procedurally generated geometry.
    // A placeholder mesh is added synchronously so the scene has something
    // immediately; the real GLB is loaded asynchronously and replaces it.
    const kind =
      Object.keys(PowerupTypes).find((k) => PowerupTypes[k] === type) ||
      type.name ||
      "generic";
    const w = gridToWorld(gx, gy);

    const group = new THREE.Group();
    group.position.set(w.x, 0.6, w.z);
    group.userData.kind = kind;

    // simple translucent placeholder while model loads
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.emissive,
      emissiveIntensity: 0.6,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    const placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      placeholderMat
    );
    placeholder.castShadow = true;
    placeholder.name = "placeholder";
    group.add(placeholder);

    // reuse a single GLTFLoader instance per Powerup class
    const loader =
      Powerup._gltfLoader || (Powerup._gltfLoader = new GLTFLoader());

    // Expect models at /models/powerups/<kind>.glb (place models in public/models/powerups)
    const modelPath = `./models/powerups/${kind}.glb`;

    loader.load(
      modelPath,
      (gltf) => {
        try {
          const model = gltf.scene.clone();

          // Normalize model size to fit roughly the same footprint as previous geometry
          const bbox = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetSize = 0.8; // approximate desired largest dimension
          if (maxDim > 0) {
            const s = targetSize / maxDim;
            model.scale.setScalar(s);
          }

          // center model on group's origin
          bbox.setFromObject(model);
          const center = bbox.getCenter(new THREE.Vector3());
          model.position.sub(center);

          model.traverse((n) => {
            if (n.isMesh) {
              n.castShadow = true;
              n.receiveShadow = true;
            }
          });

          // replace placeholder with loaded model
          group.remove(placeholder);
          group.add(model);
        } catch (e) {
          console.warn("Error processing GLTF for powerup:", modelPath, e);
        }
      },
      undefined,
      (err) => {
        // If model load fails, leave placeholder and warn
        console.warn("Failed to load powerup model:", modelPath, err);
      }
    );

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
    // pickup (with vertical + grounded checks)
    for (const p of powerups) {
      if (p.taken) continue;

      const dx = camera.position.x - p.mesh.position.x;
      const dz = camera.position.z - p.mesh.position.z;
      const d = Math.hypot(dx, dz);

      // vertical tolerance (so you can't pick up while mid-air)
      const VERT_TOL = POWERUP.VERTICAL_PICKUP_TOL ?? 0.6;

      const playerGrounded = (player && typeof player.isGrounded === "boolean")
        ? player.isGrounded
        : Math.abs(camera.position.y - p.mesh.position.y) <= VERT_TOL;

      const dy = Math.abs(camera.position.y - p.mesh.position.y);

      if (playerGrounded && d <= POWERUP.PICKUP_RADIUS && dy <= VERT_TOL) {
        p.taken = true;
        p.mesh.scale.setScalar(1.4);
        setTimeout(() => scene.remove(p.mesh), 80);
        activatePowerup(p.type, player);
        // play pickup sound if audio manager loaded
        try {
          audio.play("powerup_pick", { volume: 0.1 });
        } catch (e) {}
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