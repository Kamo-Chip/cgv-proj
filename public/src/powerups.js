// src/powerups.js
import * as THREE from "three";
import { POWERUP, MOVE } from "./constants.js";
import { gridToWorld } from "./utils.js";

<<<<<<< Updated upstream
export function initPowerups(scene, maze) {
  const powerups = []; // { mesh, gx, gy, taken }
  let jumpBoostActive = false;
  let jumpBoostTimeLeft = 0;

  // HUD elements (simple & decoupled)
  const jumpHud = document.getElementById("jumpHud");
  const jumpTimerEl = document.getElementById("jumpTimer");

  function updateJumpHud() {
    if (!jumpBoostActive) return;
    jumpTimerEl.textContent = jumpBoostTimeLeft.toFixed(1);
  }

  function createAt(gx, gy) {
    const w = gridToWorld(gx, gy);
    const geo = new THREE.TorusKnotGeometry(0.3, 0.09, 64, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7c9cff,
      emissive: 0x2a49ff,
=======
// Registry of powerup types
const ENEMY_FREEZE_DURATION = 10; // seconds, adjust as needed
const SPEEDBOOST_DURATION = 10; // seconds
const SPEEDBOOST_MULT = 2.5;
const COMPASS_DURATION = 10; // seconds
const TMP_COLOR = new THREE.Color();

const PowerupTypes = {
  jump: {
    color: 0x7c9cff,
    emissive: 0x2a49ff,
    duration: POWERUP.DURATION,
    mapStyle: {
      fill: "#7c9cff",
      ratio: 0.55,
    },
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
  compass: {
    color: 0xfff59d,
    emissive: 0xffc107,
    duration: COMPASS_DURATION,
    refreshOnExtend: true,
    mapStyle: {
      fill: "#ffd95a",
      stroke: "rgba(255,255,255,0.9)",
      ratio: 0.9,
      shape: "compass",
    },
    apply(player, ctx = {}) {
      ctx.minimap?.activateCompass?.(COMPASS_DURATION);
      if (!ctx.isRefresh) {
        try {
          audio.play("player_jump_high", { volume: 0.55 });
        } catch (e) {
          console.warn("Failed to play compass pickup cue", e);
        }
      }
    },
    clear(player, ctx = {}) {
      ctx.minimap?.clearCompass?.();
    },
    hud: {
      el: document.getElementById("compassHud"),
      timer: document.getElementById("compassTimer"),
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
    mapStyle: {
      fill: "#9fd9ff",
      ratio: 0.55,
    },
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
    mapStyle: {
      fill: "#4dff7c",
      ratio: 0.55,
    },
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
    mapStyle: {
      fill: "#ff7373",
      ratio: 0.5,
    },
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
    const kind =
      Object.keys(PowerupTypes).find((k) => PowerupTypes[k] === type) ||
      type.name ||
      "generic";
    this.kind = kind;
    const style = type.mapStyle
      ? { ...type.mapStyle }
      : {
          fill: `#${TMP_COLOR.set(type.color ?? 0x7c9cff).getHexString()}`,
          ratio: 0.6,
        };
    this.mapStyle = style;
    this.mesh = this._createMesh(type, gx, gy);
    scene.add(this.mesh);
  }
  _createMesh(type, gx, gy) {
    // Use GLTF models instead of procedurally generated geometry.
    // A placeholder mesh is added synchronously so the scene has something
    // immediately; the real GLB is loaded asynchronously and replaces it.
    const kind = this.kind;
    const w = gridToWorld(gx, gy);

    const group = new THREE.Group();
    group.position.set(w.x, 0.6, w.z);
    group.userData.kind = kind;
    group.userData.mapStyle = this.mapStyle;

    // simple translucent placeholder while model loads
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.emissive,
>>>>>>> Stashed changes
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.2,
    });
<<<<<<< Updated upstream
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.position.set(w.x, 0.6, w.z);
    scene.add(m);
    powerups.push({ mesh: m, gx, gy, taken: false });
  }
=======
    const placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      placeholderMat
    );
    placeholder.castShadow = true;
    placeholder.name = "placeholder";
    group.add(placeholder);

    if (kind === "compass") {
      const glow = new THREE.PointLight(0xffe066, 0.9, 6);
      glow.position.set(0, 0.6, 0);
      glow.castShadow = false;
      group.add(glow);

      const haloGeometry = new THREE.RingGeometry(0.32, 0.4, 32);
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const halo = new THREE.Mesh(haloGeometry, haloMaterial);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -0.28;
      group.add(halo);
    }

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
  const sharedCtx = { enemiesCtl, minimap: null };
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
=======
    const weightedPool = [
      "compass",
      "compass",
      "compass",
      "jump",
      "freeze",
      "speed",
      "health",
    ].filter((name) => PowerupTypes[name]);
    const typePool = weightedPool.length
      ? weightedPool
      : Object.keys(PowerupTypes);
    let compassPlaced = false;
>>>>>>> Stashed changes
    for (const c of cells) {
      if (placed >= POWERUP.COUNT) break;
      const ok = chosen.every(
        (d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= minCellGap
      );
      if (!ok) continue;
      chosen.push(c);
<<<<<<< Updated upstream
      createAt(c.x, c.y);
=======
      const typeName =
        typePool[Math.floor(Math.random() * typePool.length)] || "compass";
      const instance = new Powerup(PowerupTypes[typeName], c.x, c.y, scene);
      if (instance.kind === "compass") compassPlaced = true;
      powerups.push(instance);
>>>>>>> Stashed changes
      placed++;
    }

    if (!compassPlaced && powerups.length) {
      const idx = Math.floor(Math.random() * powerups.length);
      const fallback = powerups[idx];
      scene.remove(fallback.mesh);
      const compass = new Powerup(PowerupTypes.compass, fallback.gx, fallback.gy, scene);
      powerups[idx] = compass;
    }
  }

  function applyJumpBoost(player) {
    jumpBoostActive = true;
    jumpBoostTimeLeft = POWERUP.DURATION;
    player.GRAVITY = MOVE.BASE_GRAVITY * POWERUP.GRAVITY_MULT;
    player.JUMP_V = MOVE.BASE_JUMP_V * POWERUP.JUMP_MULT;
    if (jumpHud) {
      jumpHud.style.display = "inline-block";
      updateJumpHud();
    }
  }

  function clearJumpBoost(player) {
    jumpBoostActive = false;
    jumpBoostTimeLeft = 0;
    player.GRAVITY = MOVE.BASE_GRAVITY;
    player.JUMP_V = MOVE.BASE_JUMP_V;
    if (jumpHud) jumpHud.style.display = "none";
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
        applyJumpBoost(player);
      }
    }

<<<<<<< Updated upstream
    // timer
    if (jumpBoostActive) {
      jumpBoostTimeLeft -= dt;
      if (jumpBoostTimeLeft <= 0) {
        clearJumpBoost(player);
      } else {
        updateJumpHud();
      }
    }
  }

  function reset(player) {
    clearJumpBoost(player);
    scatter();
  }

  return { powerups, update, reset, scatter };
}
=======
    // timers
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.timeLeft -= dt;
      if (a.type.hud) a.type.hud.show(a.timeLeft);
      if (a.timeLeft <= 0) {
        a.type.clear(player, sharedCtx);
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
      if (type.refreshOnExtend)
        type.apply(player, { ...sharedCtx, isRefresh: true });
      if (type.hud) type.hud.show(found.timeLeft);
    } else {
      type.apply(player, sharedCtx);
      active.push({ type, timeLeft: type.duration });
      if (type.hud) type.hud.show(type.duration);
    }
  }
  function reset(player) {
    for (const a of active) {
      a.type.clear(player, sharedCtx);
      if (a.type.hud) a.type.hud.hide();
    }
    active.length = 0;
    scatter();
  }

  function setContext(ctx = {}) {
    if (ctx.minimap) sharedCtx.minimap = ctx.minimap;
  }

  return { powerups, update, reset, scatter, setContext };
}
>>>>>>> Stashed changes
