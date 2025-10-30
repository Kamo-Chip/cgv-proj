// src/enemies.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtilsModule from "three/examples/jsm/utils/SkeletonUtils.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { ENEMY, COMBAT } from "./constants.js";
import { AVATAR_HEIGHT } from "./player-avatar.js";
import { gridToWorld, worldToGrid } from "./utils.js";
import { audio } from "./audio.js";

export function initEnemies(
  scene,
  camera,
  wallGroup,
  walls,
  maze,
  onPlayerDamage,
  gltfModel
) {
  const SkeletonUtils =
    SkeletonUtilsModule.SkeletonUtils ?? SkeletonUtilsModule;
  // ---- Tunables (safe defaults; override in constants.js if you want) ----
  const MIN_PLAYER_DIST = ENEMY.MIN_PLAYER_DIST ?? 0.9; // personal-space bubble (m)
  const BASE_RADIUS = ENEMY.RADIUS ?? 0.35; // enemy sphere radius (m)
  const ATTACK_RADIUS = Math.max(
    ENEMY.ATTACK_RADIUS ?? BASE_RADIUS,
    MIN_PLAYER_DIST + 0.02
  );
  const VERTICAL_ATTACK_TOL = ENEMY.VERTICAL_ATTACK_TOLERANCE ?? 0.45; // how high off the ground before you're "airborne" for damage
  const AVOID_DISTANCE = BASE_RADIUS + 0.5; // How far ahead to check for walls (m)
  const AVOID_STRENGTH = 1.5; // How strongly to steer away (adjust as needed)

  // Auto-calibrate player's ground eye-height at first update (or whenever we see a lower eye Y)
  let eyeGroundBaselineY = null; // camera.y when on ground
  function updateEyeGroundBaseline() {
    if (eyeGroundBaselineY === null) {
      eyeGroundBaselineY = camera.position.y;
    } else {
      // keep the *lowest* seen eye height as baseline (in case we started mid-air)
      if (camera.position.y < eyeGroundBaselineY)
        eyeGroundBaselineY = camera.position.y;
    }
  }
  function playerVerticalOffsetFromGround() {
    if (eyeGroundBaselineY === null) return 0; // before first frame, assume grounded
    return camera.position.y - eyeGroundBaselineY; // ~0 when grounded, >0 when airborne
  }

  const enemies = []; // { mesh, gx, gy, path, targetIndex, vx, vz, ... }
  const enemyGeo = new THREE.SphereGeometry(BASE_RADIUS, 16, 16);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xff5252,
    emissive: 0x550000,
    emissiveIntensity: 0.2,
    roughness: 0.6,
  });

  function lower(str) {
    return (str ?? "").toLowerCase();
  }

  function setModelMaterial(model, callback) {
    model.traverse((node) => {
      if (node.isMesh && node.material) {
        // Handle both single and multi-materials
        if (Array.isArray(node.material)) {
          node.material.forEach(callback);
        } else {
          callback(node.material);
        }
      }
    });
  } // Helper to cache original materials (for un-freezing)

  function cacheOriginalMaterials(model) {
    const cache = new Map();
    setModelMaterial(model, (mat) => {
      if (!cache.has(mat.uuid)) {
        cache.set(mat.uuid, {
          color: mat.color.clone(),
          emissive: mat.emissive.clone(),
        });
      }
    });
    return cache;
  }

  // Calculates a steering vector to avoid nearby walls
  function getWallAvoidanceVector(posX, posZ, moveDirX, moveDirZ) {
    const feelerX = posX + moveDirX * AVOID_DISTANCE;
    const feelerZ = posZ + moveDirZ * AVOID_DISTANCE;

    let avoidanceX = 0;
    let avoidanceZ = 0;
    let wallsDetected = 0;

    for (const w of walls) {
      // Find closest point on wall AABB to the feeler point
      const cx = Math.max(w.min.x, Math.min(feelerX, w.max.x));
      const cz = Math.max(w.min.z, Math.min(feelerZ, w.max.z));

      // Vector from closest point to feeler
      const ddx = feelerX - cx;
      const ddz = feelerZ - cz;
      const distanceSq = ddx * ddx + ddz * ddz;

      // Is the feeler point "inside" the wall's AABB (within radius)?
      // We use a radius slightly smaller than BASE_RADIUS for the feeler
      // to trigger avoidance before the enemy center actually hits.
      const checkRadius = BASE_RADIUS * 0.8;
      if (distanceSq < checkRadius * checkRadius) {
        const distance = Math.sqrt(distanceSq) || 1e-5;

        // Calculate push-out direction (normal approximation)
        // This pushes directly away from the closest point on the wall AABB
        const pushX = ddx / distance;
        const pushZ = ddz / distance;

        // Accumulate avoidance force, stronger if deeper penetration
        const penetration = checkRadius - distance;
        avoidanceX += pushX * penetration;
        avoidanceZ += pushZ * penetration;
        wallsDetected++;
      }
    }

    if (wallsDetected > 0) {
      // Normalize the combined avoidance vector
      const avoidMag = Math.hypot(avoidanceX, avoidanceZ);
      if (avoidMag > 1e-5) {
        return { x: avoidanceX / avoidMag, z: avoidanceZ / avoidMag };
      }
    }

    return null; // No avoidance needed
  }

  const _targetQuat = new THREE.Quaternion();
  const _currentDir = new THREE.Vector3();
  function rotateTowards(object, targetX, targetZ, dt) {
    const speed = 8; // Rotation speed (adjust as needed) // Calculate target angle
    const targetAngle = Math.atan2(
      -(targetZ - object.position.z),
      targetX - object.position.x
    );
    _targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle); // Smoothly interpolate (slerp) towards the target quaternion

    object.quaternion.slerp(_targetQuat, speed * dt);
  }

  const raycaster = new THREE.Raycaster();
  const losRaycaster = new THREE.Raycaster();
  const ndcCenter = new THREE.Vector2(0, 0);
  const wallMeshes = wallGroup?.children ? wallGroup.children.slice() : [];

  let healthLayer = document.getElementById("enemyHealthLayer");
  if (!healthLayer) {
    healthLayer = document.createElement("div");
    healthLayer.id = "enemyHealthLayer";
    Object.assign(healthLayer.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: 1200,
    });
    document.body.appendChild(healthLayer);
  }

  let timeSinceReplan = 0;
  let fireTimer = 0;
  let frozen = false;

  // ---------------- RAM behaviour knobs (fallbacks if not defined in ENEMY) ---------------
  const RAM = {
    TRIGGER_DIST: ENEMY.RAM_TRIGGER_DIST ?? 1.6,
    WINDUP_TIME: ENEMY.RAM_WINDUP_TIME ?? 0.22,
    CHARGE_TIME: ENEMY.RAM_CHARGE_TIME ?? 0.18,
    BACKOFF_TIME: ENEMY.RAM_BACKOFF_TIME ?? 0.26,
    COOLDOWN_TIME: ENEMY.RAM_COOLDOWN_TIME ?? 0.32,
    CHARGE_SPEED: ENEMY.RAM_CHARGE_SPEED ?? ENEMY.SPEED * 2.6,
    BACKOFF_SPEED: ENEMY.RAM_BACKOFF_SPEED ?? ENEMY.SPEED * 1.7,

    // use your normal attack radius unless you explicitly override
    HIT_RADIUS: ENEMY.RAM_HIT_RADIUS ?? ATTACK_RADIUS,

    DAMAGE: ENEMY.RAM_DAMAGE ?? Math.max(ENEMY.DMG_PER_SEC * 0.6, 5),
  };

  function createEnemyHealthUi() {
    if (!healthLayer) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "enemy-health-wrapper";
    const bar = document.createElement("div");
    bar.className = "enemy-health-bar";
    const healthFill = document.createElement("div");
    healthFill.className = "enemy-health-fill";
    const lostFill = document.createElement("div");
    lostFill.className = "enemy-health-lost";
    const healFill = document.createElement("div");
    healFill.className = "enemy-health-heal";

    bar.appendChild(healthFill);
    bar.appendChild(lostFill);
    bar.appendChild(healFill);
    wrapper.appendChild(bar);
    wrapper.style.display = "none";
    healthLayer.appendChild(wrapper);

    return {
      wrapper,
      healthFill,
      lostFill,
      healFill,
      lastPct: 1,
    };
  }

  function animateBarSegment(segment, leftPct, widthPct, colorKeyframes) {
    if (!segment) return;
    segment.getAnimations().forEach((anim) => anim.cancel());
    if (widthPct <= 0) {
      segment.style.opacity = "0";
      segment.style.width = "0";
      return;
    }
    segment.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
    segment.style.width = `${Math.max(0, Math.min(100, widthPct))}%`;
    segment.style.opacity = "1";
    const animation = segment.animate(colorKeyframes, {
      duration: 520,
      easing: "ease-out",
      fill: "forwards",
    });
    animation.onfinish = () => {
      segment.style.opacity = "0";
      segment.style.width = "0";
    };
  }

  function applyHealthDelta(enemy, delta) {
    if (!enemy.ui) return;
    const pct = Math.max(0, Math.min(1, enemy.hp / 100));
    const prevPct = enemy.ui.lastPct ?? 1;
    enemy.ui.healthFill.style.width = `${pct * 100}%`;

    if (delta < -1e-3 && prevPct > pct) {
      const diff = prevPct - pct;
      animateBarSegment(enemy.ui.lostFill, pct * 100, diff * 100, [
        { opacity: 1 },
        { opacity: 0.85, offset: 0.25 },
        { opacity: 0 },
      ]);
    } else if (delta > 1e-3 && pct > prevPct) {
      const diff = pct - prevPct;
      animateBarSegment(enemy.ui.healFill, prevPct * 100, diff * 100, [
        { opacity: 1 },
        { opacity: 0.7, offset: 0.35 },
        { opacity: 0 },
      ]);
    }

    enemy.ui.lastPct = pct;
  }

  const tmpVec = new THREE.Vector3();
  const enemyHead = new THREE.Vector3();

  function updateEnemyHealthUi(enemy) {
    if (!enemy.ui) return;
    if (enemy.dead) {
      enemy.ui.wrapper.style.display = "none";
      return;
    } // --- FIX: Calculate anchor point above the model's head ---

    enemyHead.copy(enemy.mesh.position);

    // Use modelTopOffset if available (from GLTF)
    // Otherwise, use BASE_RADIUS (for sphere fallback, since sphere origin is its center)
    const headOffset = enemy.modelTopOffset ?? BASE_RADIUS;

    // Anchor the UI to the model's mesh position + its calculated top offset + a small buffer
    enemyHead.y = enemy.mesh.position.y + headOffset + 0.1; // 0.1m buffer

    // --- FIX: Add distance-based scaling ---
    const distance = camera.position.distanceTo(enemyHead);

    tmpVec.copy(enemyHead).project(camera);
    const isBehind = tmpVec.z < 0 || tmpVec.z > 1;
    if (isBehind) {
      enemy.ui.wrapper.style.display = "none";
      return;
    }

    const rawScreenX = (tmpVec.x * 0.5 + 0.5) * window.innerWidth;
    const rawScreenY = (-tmpVec.y * 0.5 + 0.5) * window.innerHeight;

    // Clamp scale between a min and max size
    const refDistance = 5.0; // At 5 meters, scale is 1
    const minScale = 0.4;
    const maxScale = 1.2;
    let scale = refDistance / Math.max(distance, 0.1);
    scale = Math.max(minScale, Math.min(scale, maxScale));

    const onScreen =
      rawScreenX >= -40 &&
      rawScreenX <= window.innerWidth + 40 &&
      rawScreenY >= 0 &&
      rawScreenY <= window.innerHeight + 40;

    // --- FIX: Use raw screen coords, not fixed pixel offset ---
    const screenX = rawScreenX;
    const screenY = rawScreenY; // Remove the old "- 36"
    if (!onScreen) {
      enemy.ui.wrapper.style.display = "none";
      return;
    }

    if (wallMeshes.length) {
      tmpVec.copy(enemyHead).sub(camera.position);
      const dist = tmpVec.length();
      if (dist > 0.0001) {
        tmpVec.normalize();
        losRaycaster.set(camera.position, tmpVec);
        losRaycaster.far = dist - BASE_RADIUS * 0.35;
        const occluders = losRaycaster.intersectObjects(wallMeshes, false);
        if (occluders.length) {
          enemy.ui.wrapper.style.display = "none";
          return;
        }
      }
    }

    enemy.ui.wrapper.style.display = "block";
    enemy.ui.wrapper.style.left = `${screenX}px`;
    enemy.ui.wrapper.style.top = `${screenY}px`;

    // --- FIX: Apply scale and positioning transforms ---
    // translate(-50%, -100%) anchors the bar's BOTTOM-CENTER to the screenX/Y point
    enemy.ui.wrapper.style.transform = `translate(-50%, -100%) scale(${scale})`;
    // transformOrigin ensures it scales *from* that bottom-center anchor point
    enemy.ui.wrapper.style.transformOrigin = "50% 100%";
  }

  function removeEnemyUi(enemy) {
    if (enemy?.ui?.wrapper && enemy.ui.wrapper.parentElement) {
      enemy.ui.wrapper.parentElement.removeChild(enemy.ui.wrapper);
    }
    enemy.ui = null;
  }

  function applyDamage(enemy, amount) {
    if (!enemy || enemy.dead) return;
    enemy.hp -= amount;
    enemy.hitFlash = 0.5;
    const origScale = enemy.mesh.scale.x;
    enemy.mesh.scale.setScalar(origScale * 1.05);
    setTimeout(() => {
      if (enemy.mesh) enemy.mesh.scale.setScalar(origScale);
    }, 120);
    applyHealthDelta(enemy, -amount);
    if (enemy.hp <= 0 && !enemy.dead) {
      enemy.dead = true;
      enemy.deathTimer = 1.2;
      if (enemy.ui) enemy.ui.wrapper.style.display = "none";
    }
  }

  // ---------------- Pathfinding (grid BFS) ----------------
  function bfsPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [{ gx: sx, gy: sy }];
    const H = maze.length,
      W = maze[0].length;
    const q = [[sx, sy]];
    const visited = Array.from({ length: H }, () => Array(W).fill(false));
    const prev = Array.from({ length: H }, () => Array(W).fill(null));
    visited[sy][sx] = true;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of dirs) {
        const nx = x + dx,
          ny = y + dy;
        if (
          ny >= 0 &&
          ny < H &&
          nx >= 0 &&
          nx < W &&
          !visited[ny][nx] &&
          maze[ny][nx] === 1
        ) {
          visited[ny][nx] = true;
          prev[ny][nx] = [x, y];
          if (nx === tx && ny === ty) {
            const path = [{ gx: tx, gy: ty }];
            let cx = tx,
              cy = ty;
            while (prev[cy][cx]) {
              const [px, py] = prev[cy][cx];
              path.push({ gx: px, gy: py });
              cx = px;
              cy = py;
            }
            path.reverse();
            return path;
          }
          q.push([nx, ny]);
        }
      }
    }
    return null;
  }

  // ---------------- Spawning ----------------
  function chooseSpawnCell() {
    const H = maze.length,
      W = maze[0].length;
    const px = camera.position.x,
      pz = camera.position.z;
    const options = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (maze[y][x] !== 1) continue;
        const w = gridToWorld(x, y);
        const dPlayer = Math.hypot(w.x - px, w.z - pz);
        if (dPlayer < ENEMY.SPAWN_MIN_DIST) continue;
        let ok = true;
        for (const e of enemies) {
          const de = Math.hypot(
            w.x - e.mesh.position.x,
            w.z - e.mesh.position.z,
          );
          if (de < ENEMY.SEPARATION_DIST) {
            ok = false;
            break;
          }
        }
        if (ok) options.push({ x, y });
      }
    }
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  // spawnEnemy: use ENEMY_MODEL (note name) and scale consistently
  function spawnEnemy() {
    let cell = null;
    for (let i = 0; i < ENEMY.MAX_SPAWN_TRIES && !cell; i++)
      cell = chooseSpawnCell();
    if (!cell) return false;

    const w = gridToWorld(cell.x, cell.y); // --- MODIFIED: Use GLB model if available, otherwise fallback to sphere ---

    let mesh;
    let materialCache = null; // For this specific clone
    let modelTopOffset = null;

    if (gltfModel) {
      // Use SkeletonUtils.clone for animated/complex models
      mesh = SkeletonUtils.clone(gltfModel); // Cache this clone's original materials for un-freezing
      materialCache = cacheOriginalMaterials(mesh); // Auto-scale the model to match the BASE_RADIUS // We'll scale it so its *largest dimension* matches the sphere's *diameter*

      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const targetDiameter = BASE_RADIUS * 1.35; // Ensure maxDim is not zero to avoid division by zero
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 1e-5 ? targetDiameter / maxDim : 1;
      mesh.scale.setScalar(scale);

      // --- FIX: Recalculate box AFTER scaling to get correct bounds ---
      box.setFromObject(mesh);
      modelTopOffset = box.max.y; // Y-coord of the top, relative to mesh origin // Define the offset from the model's origin (0,0,0) down to its visual base/feet.

      // Define the offset from the model's origin (0,0,0) down to its visual base/feet.
      // YOU MUST ADJUST THIS VALUE FOR YOUR MODEL!
      // Negative value means origin is ABOVE the base.
      const originToBaseOffset = 0; // <-- !!! EXAMPLE VALUE - TUNE THIS !!!

      // Calculate posY to place the *base* near Y=0, accounting for the scale
      // (originToBaseOffset * scale) = world distance from scaled origin to the base
      const posY = -(originToBaseOffset * scale);

      const hoverOffset = 0.67

      mesh.position.set(w.x, posY+ hoverOffset, w.z);

      // Enable shadows for all sub-meshes

      mesh.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
        }
      });
    } else {
      // Fallback to the sphere if the model didn't load
      mesh = new THREE.Mesh(enemyGeo, baseMat.clone());
      mesh.castShadow = true;
      mesh.position.set(w.x, BASE_RADIUS, w.z);
    }

    scene.add(mesh);

    const ui = createEnemyHealthUi();

    const enemyObj = {
      mesh,
      gx: cell.x,
      gy: cell.y,
      path: [],
      targetIndex: 0,
      vx: 0,
      vz: 0,
      wanderTimer: 0,
      wanderChangeInterval: 1 + Math.random() * 2,
      hp: 100,
      hitFlash: 0,
      dead: false,
      lastWaypointDist: Infinity,
      noProgressTime: 0,
      ramState: "chase",
      ramT: 0,
      ramDir: { x: 0, z: 0 },
      ramHasHit: false,
      ramSide: Math.random() < 0.5 ? 1 : -1,
      ui,
      materialCache: materialCache,
      modelTopOffset: modelTopOffset 
    };

    enemies.push(enemyObj);
    applyHealthDelta(enemyObj, 0);

    return true;
  }

  function reset() {
    for (const e of enemies) {
      scene.remove(e.mesh);
      removeEnemyUi(e);
    }
    enemies.length = 0;
    for (let i = 0; i < ENEMY.TARGET_COUNT; i++) spawnEnemy();
    timeSinceReplan = ENEMY.REPLAN_DT;
    fireTimer = 0;
  }

  function ensureQuota() {
    while (enemies.length < ENEMY.TARGET_COUNT) {
      if (!spawnEnemy()) break;
    }
  }

  function slideOutOfWalls(nx, nz) {
    // pushes the point (nx, nz) out of AABBs and returns the corrected position
    const epsilon = 0.001; // Small buffer to prevent getting stuck
    for (const w of walls) {
      // Find closest point on wall AABB to the enemy center
      const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
      const cz = Math.max(w.min.z, Math.min(nz, w.max.z));

      // Vector from closest point to enemy center
      const ddx = nx - cx;
      const ddz = nz - cz;

      const distanceSq = ddx * ddx + ddz * ddz;
      const radiusSq = BASE_RADIUS * BASE_RADIUS;

      // Check for penetration
      if (distanceSq < radiusSq) {
        const distance = Math.sqrt(distanceSq) || 1e-5; // Avoid division by zero
        // Calculate how much we need to push out
        const penetrationDepth = BASE_RADIUS - distance;
        const pushOutDistance = penetrationDepth + epsilon; // Add the buffer

        // Normalized direction vector for pushing out
        const pushX = ddx / distance;
        const pushZ = ddz / distance;

        // Apply the push
        nx += pushX * pushOutDistance;
        nz += pushZ * pushOutDistance;
      }
    }
    return { nx, nz };
  }
  // ---------------- Steering / Collision helpers ----------------
  function keepDistanceFromPlayer(pos) {
    const dx = pos.x - camera.position.x;
    const dz = pos.z - camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d < MIN_PLAYER_DIST && d > 1e-6) {
      const k = MIN_PLAYER_DIST / d;
      pos.x = camera.position.x + dx * k;
      pos.z = camera.position.z + dz * k;
    }
  }

  function resolveEnemyOverlaps() {
    const minDist = BASE_RADIUS * 2;
    const minDist2 = minDist * minDist;

    for (let iter = 0; iter < ENEMY.SEPARATION_ITERATIONS; iter++) {
      // enemy-enemy
      for (let i = 0; i < enemies.length; i++) {
        const ei = enemies[i];
        if (ei.dead) continue;
        const pi = ei.mesh.position;
        for (let j = i + 1; j < enemies.length; j++) {
          const ej = enemies[j];
          if (ej.dead) continue;
          const pj = ej.mesh.position;
          let dx = pj.x - pi.x,
            dz = pj.z - pi.z,
            d2 = dx * dx + dz * dz;
          if (d2 < minDist2) {
            if (d2 < 1e-8) {
              const a = Math.random() * Math.PI * 2;
              dx = Math.cos(a) * 0.001;
              dz = Math.sin(a) * 0.001;
              d2 = dx * dx + dz * dz;
            }
            const d = Math.sqrt(d2);
            const overlap = (minDist - d) * 0.5 * ENEMY.PUSH_FACTOR;
            const ux = dx / d,
              uz = dz / d;
            pi.x -= ux * overlap;
            pi.z -= uz * overlap;
            pj.x += ux * overlap;
            pj.z += uz * overlap;
          }
        }
      }
      // enemy-wall
      for (const e of enemies) {
        if (e.dead) continue;
        let { nx, nz } = slideOutOfWalls(e.mesh.position.x, e.mesh.position.z);
        e.mesh.position.x = nx;
        e.mesh.position.z = nz;
      }
    }
    // keep them out of the player's personal space too
    for (const e of enemies) {
      if (e.dead) continue;
      keepDistanceFromPlayer(e.mesh.position);
    }
  }

  function forceReplanForEnemy(e, playerGrid) {
    const distToPlayer = Math.hypot(
      e.mesh.position.x - camera.position.x,
      e.mesh.position.z - camera.position.z
    );
    if (distToPlayer > ENEMY.PATHFIND_RADIUS) {
      e.path = [];
      e.targetIndex = 0;
      e.noProgressTime = 0;
      e.lastWaypointDist = Infinity;
      return;
    }
    const here = worldToGrid(e.mesh.position.x, e.mesh.position.z);
    e.gx = here.gx;
    e.gy = here.gy;
    const path = bfsPath(e.gx, e.gy, playerGrid.gx, playerGrid.gy);
    if (path && path.length > 1) {
      e.path = path;
      e.targetIndex = 1;
    } else {
      e.path = [];
      e.targetIndex = 0;
    }
    e.noProgressTime = 0;
    e.lastWaypointDist = Infinity;
    const a = Math.random() * Math.PI * 2;
    e.mesh.position.x += Math.cos(a) * 0.02;
    e.mesh.position.z += Math.sin(a) * 0.02;
  }

  // ---------------- Status: freeze ----------------
  function setFrozen(isFrozen) {
    frozen = isFrozen;

    for (const e of enemies) {
      setModelMaterial(e.mesh, (mat) => {
        if (isFrozen) {
          mat.color.set(0xcccccc);
          mat.emissive.set(0x555555);
        } else {
          // Restore from cache if it exists, otherwise use defaults
          const original = e.materialCache?.get(mat.uuid);
          if (original) {
            mat.color.copy(original.color);
            mat.emissive.copy(original.emissive);
          } else {
            // Fallback for sphere
            mat.color.set(0xff5252);
            mat.emissive.set(0x550000);
          }
        }
      });
    }
  }

  function enterRam(e, state, t, dirx, dirz) {
    e.ramState = state;
    e.ramT = t;
    if (dirx !== undefined) {
      e.ramDir.x = dirx;
      e.ramDir.z = dirz;
    }
  }

  // ---------------- Main update ----------------
  function update(dt, canDealDamage = true) {
    // continuously learn the "ground eye height"
    updateEyeGroundBaseline();

    const airborneOffset = Math.abs(playerVerticalOffsetFromGround());
    const canHitByHeight = airborneOffset <= VERTICAL_ATTACK_TOL;

    if (frozen) {
      for (const e of enemies) {
        if (e.dead) {
          if (typeof e.deathTimer === "number") {
            e.deathTimer = Math.max(0, e.deathTimer - dt);
          }
          continue;
        }
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        setModelMaterial(e.mesh, (mat) => {
          if (mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = 0.2 + e.hitFlash * 1.0;
          }
        });
      }
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (!enemy.dead) continue;
        if (typeof enemy.deathTimer === "number" && enemy.deathTimer > 0)
          continue;
        scene.remove(enemy.mesh);
        removeEnemyUi(enemy);
        enemies.splice(i, 1);
      }
      for (const e of enemies) updateEnemyHealthUi(e);
      ensureQuota();
      if (fireTimer > 0) fireTimer = Math.max(0, fireTimer - dt);
      return;
    }

    timeSinceReplan += dt;
    const pg = worldToGrid(camera.position.x, camera.position.z);

    // periodic replan (only for chasers)
    if (timeSinceReplan >= ENEMY.REPLAN_DT) {
      for (const e of enemies) {
        if (e.dead) continue;
        if (e.ramState !== "chase") continue; // don't replan during ram
        const distToPlayer = Math.hypot(
          e.mesh.position.x - camera.position.x,
          e.mesh.position.z - camera.position.z
        );
        if (distToPlayer <= ENEMY.PATHFIND_RADIUS) {
          const path = bfsPath(e.gx, e.gy, pg.gx, pg.gy);
          if (path && path.length > 1) {
            e.path = path;
            e.targetIndex = 1;
          }
        } else {
          e.path = [];
          e.targetIndex = 0;
        }
      }
      timeSinceReplan = 0;
    }

    // move enemies
    for (const e of enemies) {
      if (e.dead) {
        if (e.mixer) e.mixer.update(dt);
        if (typeof e.deathTimer === "number") {
          e.deathTimer = Math.max(0, e.deathTimer - dt);
        }
        continue;
      }

      const prevX = e.mesh.position.x;
      const prevZ = e.mesh.position.z;

      // --- Calculate desired movement direction (dx, dz) based on state ---
      let desiredDx = 0;
      let desiredDz = 0;
      let moveSpeed = ENEMY.SPEED; // Default speed
      let targetX = prevX,
        targetZ = prevZ; // For rotation // --- Decay hit flash ---

      e.hitFlash = Math.max(0, e.hitFlash - dt);
      setModelMaterial(e.mesh, (mat) => {
        if (mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = 0.2 + e.hitFlash * 1.0;
        }
      }); // --- Sync grid pos ---

      const here = worldToGrid(prevX, prevZ); // Use prevX/Z for consistency within frame
      e.gx = here.gx;
      e.gy = here.gy; // --- Calculate player direction ---

      let tdx = camera.position.x - prevX;
      let tdz = camera.position.z - prevZ;
      const tpDist = Math.hypot(tdx, tdz);
      const ux = tpDist > 1e-6 ? tdx / tpDist : 0;
      const uz = tpDist > 1e-6 ? tdz / tpDist : 0; // --- Check for Ram initiation ---

      if (e.ramState === "chase" && tpDist <= RAM.TRIGGER_DIST) {
        e.ramHasHit = false;
        enterRam(e, "windup", RAM.WINDUP_TIME, ux, uz);
        // Ensure state change happens before movement calculation for this frame
        e.ramState = "windup"; // Explicitly set state here
      }

      // --- Determine desired direction based on state ---
      if (e.ramState !== "chase") {
        // --- Ram State ---
        moveSpeed = 0; // Ram states set their own speed magnitude

        if (e.ramState === "windup") {
          desiredDx = -e.ramDir.x; // Move slightly backward
          desiredDz = -e.ramDir.z;
          moveSpeed = RAM.BACKOFF_SPEED * 0.5;
          targetX = camera.position.x; // Look at player
          targetZ = camera.position.z;

          e.ramT -= dt;
          if (e.ramT <= 0) {
            e.ramHasHit = false;
            enterRam(e, "charge", RAM.CHARGE_TIME, ux, uz); // Prepare for next state
            // Don't change state *during* movement calculation
          }
        } else if (e.ramState === "charge") {
          desiredDx = e.ramDir.x; // Move forward
          desiredDz = e.ramDir.z;
          moveSpeed = RAM.CHARGE_SPEED;
          targetX = prevX + desiredDx; // Look in charge direction
          targetZ = prevZ + desiredDz;

          // Check hit (keep existing logic)
          if (!e.ramHasHit && canDealDamage && canHitByHeight) {
            const pdx = camera.position.x - prevX; // Use prevX for consistency
            const pdz = camera.position.z - prevZ;
            if (Math.hypot(pdx, pdz) <= RAM.HIT_RADIUS) {
              onPlayerDamage(RAM.DAMAGE);
              e.ramHasHit = true;
              try {
                audio.play?.("player_damage", { volume: 0.9 });
              } catch (err) {}
            }
          }

          e.ramT -= dt;
          if (e.ramT <= 0) {
            enterRam(e, "backoff", RAM.BACKOFF_TIME, e.ramDir.x, e.ramDir.z);
          }
        } else if (e.ramState === "backoff") {
          desiredDx = -e.ramDir.x; // Move backward
          desiredDz = -e.ramDir.z;
          moveSpeed = RAM.BACKOFF_SPEED;
          targetX = camera.position.x; // Look at player
          targetZ = camera.position.z;

          e.ramT -= dt;
          if (e.ramT <= 0) {
            enterRam(e, "cooldown", RAM.COOLDOWN_TIME);
          }
        } else if (e.ramState === "cooldown") {
          // Drift slightly towards player
          const drift = Math.min(tpDist, 0.3);
          desiredDx = ux;
          desiredDz = uz;
          moveSpeed = drift * 0.25; // Slow drift
          targetX = camera.position.x; // Look at player
          targetZ = camera.position.z;

          e.ramT -= dt;
          if (e.ramT <= 0) {
            if (tpDist <= RAM.TRIGGER_DIST * 1.1) {
              e.ramHasHit = false;
              enterRam(e, "windup", RAM.WINDUP_TIME, ux, uz); // Loop ram
            } else {
              e.ramState = "chase"; // Return to chase
            }
          }
        }
      } else if (e.path && e.path.length > 0 && e.targetIndex < e.path.length) {
        // --- Path Following State ---
        const targetCell = e.path[e.targetIndex]; // Use targetIndex directly
        const tw = gridToWorld(targetCell.gx, targetCell.gy);
        targetX = tw.x; // Target for movement & rotation
        targetZ = tw.z;

        let dirToTargetX = targetX - prevX;
        let dirToTargetZ = targetZ - prevZ;
        const distToTarget = Math.hypot(dirToTargetX, dirToTargetZ);
        const moveDist = ENEMY.SPEED * dt;

        if (distToTarget <= moveDist || distToTarget < 0.02) {
          // Adjusted threshold
          // Reached (or very close to) waypoint
          e.mesh.position.x = targetX; // Snap position
          e.mesh.position.z = targetZ;
          e.gx = targetCell.gx;
          e.gy = targetCell.gy;
          e.targetIndex++; // Advance path index

          // If there's a next waypoint, set direction towards it for *this frame*
          if (e.targetIndex < e.path.length) {
            const nextTargetCell = e.path[e.targetIndex];
            const nextTw = gridToWorld(nextTargetCell.gx, nextTargetCell.gy);
            desiredDx = nextTw.x - targetX; // Use snapped position as origin
            desiredDz = nextTw.z - targetZ;
            targetX = nextTw.x; // Update rotation target for next frame's look
            targetZ = nextTw.z;
          } else {
            desiredDx = 0; // Reached end of path
            desiredDz = 0;
            e.path = []; // Clear path
          }
          // Set moveSpeed based on remaining distance in this frame if snapped
          moveSpeed = moveDist - distToTarget > 0 ? ENEMY.SPEED : 0; // Use remaining fraction of speed or stop
          // Re-normalize direction if moving further this frame
          const nextMag = Math.hypot(desiredDx, desiredDz);
          if (moveSpeed > 0 && nextMag > 1e-5) {
            desiredDx /= nextMag;
            desiredDz /= nextMag;
          } else {
            desiredDx = 0;
            desiredDz = 0;
            moveSpeed = 0;
          }
        } else {
          // Move towards current waypoint
          desiredDx = dirToTargetX;
          desiredDz = dirToTargetZ;
          moveSpeed = ENEMY.SPEED; // Full speed towards current target
        }
      } else {
        // --- Wander State ---
        e.path = []; // Clear path if invalid
        e.wanderTimer = (e.wanderTimer || 0) + dt;
        if (e.wanderTimer >= (e.wanderChangeInterval || 0)) {
          const a = Math.random() * Math.PI * 2;
          e.vx = Math.cos(a) * ENEMY.WANDER_SPEED;
          e.vz = Math.sin(a) * ENEMY.WANDER_SPEED;
          e.wanderChangeInterval = 1 + Math.random() * 2;
          e.wanderTimer = 0;
        }

        desiredDx = e.vx || 0;
        desiredDz = e.vz || 0;
        moveSpeed = 1.0; // Wander uses vx, vz directly scaled by dt later

        targetX = prevX + desiredDx; // Target for rotation
        targetZ = prevZ + desiredDz;
      }

      // --- Normalize desired direction (unless it's zero or wander) ---
      // Wander direction already incorporates speed
      if (e.ramState !== "chase" || (e.path && e.path.length > 0)) {
        const desiredMag = Math.hypot(desiredDx, desiredDz);
        if (desiredMag > 1e-5) {
          desiredDx /= desiredMag;
          desiredDz /= desiredMag;
        } else {
          // If not moving and not wander, ensure speed is 0
          if (e.ramState === "chase" && (!e.path || e.path.length === 0)) {
            // only zero out speed if not wandering
          } else {
            moveSpeed = 0;
          }
        }
      }

      // --- Calculate Wall Avoidance ---
      let finalDx = desiredDx;
      let finalDz = desiredDz;
      if (
        moveSpeed > 0 ||
        (e.ramState === "chase" && (!e.path || e.path.length === 0))
      ) {
        // Avoid if moving or wandering
        // Use current velocity for wander, desired direction otherwise
        const checkDx =
          e.ramState === "chase" && (!e.path || e.path.length === 0)
            ? e.vx || 0
            : desiredDx;
        const checkDz =
          e.ramState === "chase" && (!e.path || e.path.length === 0)
            ? e.vz || 0
            : desiredDz;
        const checkMag = Math.hypot(checkDx, checkDz);

        if (checkMag > 1e-5) {
          // Only check if there's a direction
          const avoidance = getWallAvoidanceVector(
            prevX,
            prevZ,
            checkDx / checkMag,
            checkDz / checkMag
          );
          if (avoidance) {
            // Combine direction with avoidance
            finalDx = checkDx / checkMag + avoidance.x * AVOID_STRENGTH;
            finalDz = checkDz / checkMag + avoidance.z * AVOID_STRENGTH;
            const finalMag = Math.hypot(finalDx, finalDz);
            if (finalMag > 1e-5) {
              finalDx /= finalMag;
              finalDz /= finalMag;
              // Adjust rotation target slightly towards avoidance direction
              targetX = prevX + finalDx;
              targetZ = prevZ + finalDz;
            } else {
              // Avoidance cancelled out movement, stop
              finalDx = 0;
              finalDz = 0;
              moveSpeed = 0;
            }
          } else {
            // No avoidance needed, use original desired/wander direction
            finalDx = checkDx / checkMag;
            finalDz = checkDz / checkMag;
          }
        } else {
          finalDx = 0;
          finalDz = 0;
          moveSpeed = 0;
        }
      } else {
        finalDx = 0;
        finalDz = 0;
        moveSpeed = 0;
      }

      // --- Calculate final position delta ---
      // Wander speed is handled differently
      const moveAmount =
        e.ramState === "chase" && (!e.path || e.path.length === 0)
          ? 1.0
          : moveSpeed * dt;
      let nx =
        prevX +
        finalDx *
          moveAmount *
          (e.ramState === "chase" && (!e.path || e.path.length === 0)
            ? dt
            : 1.0); // Apply dt for wander here
      let nz =
        prevZ +
        finalDz *
          moveAmount *
          (e.ramState === "chase" && (!e.path || e.path.length === 0)
            ? dt
            : 1.0);

      ({ nx, nz } = slideOutOfWalls(nx, nz));
      e.mesh.position.set(nx, e.mesh.position.y, nz);
      keepDistanceFromPlayer(e.mesh.position); // enforce personal space
      if (e.mixer) {
        const speed = Math.hypot(e.vx || 0, e.vz || 0);
        playEnemyState(e, speed > 0.05 ? "walk" : "idle");
      }
      // --- Apply Rotation ---
      // Rotate if intending to move OR during non-chase ram phases
      if (
        moveSpeed > 0.01 ||
        (Math.abs(e.vx) + Math.abs(e.vz) > 0.01 &&
          (!e.path || e.path.length === 0)) ||
        e.ramState !== "chase"
      ) {
        rotateTowards(e.mesh, targetX, targetZ, dt);
      }
    }

    // --- End of primary movement loop ---
    resolveEnemyOverlaps();
    for (const e of enemies) updateEnemyHealthUi(e);

    for (const e of enemies) {
      if (e.dead) continue;
      keepDistanceFromPlayer(e.mesh.position); // Apply player separation
    }

    for (const e of enemies) {
      if (e.dead) continue;
      const { nx, nz } = slideOutOfWalls(e.mesh.position.x, e.mesh.position.z);
      e.mesh.position.x = nx;
      e.mesh.position.z = nz;
    }

    // DAMAGE: must be close horizontally AND not airborne (by calibrated offset)
    if (canDealDamage && canHitByHeight) {
      for (const e of enemies) {
        if (e.dead) continue;
        const pdx = camera.position.x - e.mesh.position.x;
        const pdz = camera.position.z - e.mesh.position.z;
        const horiz = Math.hypot(pdx, pdz);
        if (horiz <= ATTACK_RADIUS) {
          onPlayerDamage(ENEMY.DMG_PER_SEC * dt);
        }
      }
    }

    // prune dead & top up
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      if (!enemy.dead) continue;
      if (typeof enemy.deathTimer === "number" && enemy.deathTimer > 0)
        continue;
      scene.remove(enemy.mesh);
      removeEnemyUi(enemy);
      enemies.splice(i, 1);
    }
    ensureQuota();

    if (fireTimer > 0) fireTimer = Math.max(0, fireTimer - dt);
  }

  // ---------------- Player attack (raycast from crosshair) ----------------
  function performAttack(overrideWallGroup) {
    if (fireTimer > 0) return;
    fireTimer = COMBAT.FIRE_COOLDOWN;
    raycaster.setFromCamera(ndcCenter, camera);
    raycaster.far = COMBAT.RAYCAST_MAX;

    const aliveMeshes = enemies.filter((e) => !e.dead).map((e) => e.mesh);
    const hitsEnemies = raycaster.intersectObjects(aliveMeshes, true);
    const blockingGroup = overrideWallGroup ?? wallGroup;
    const hitsWalls = blockingGroup
      ? raycaster.intersectObjects([blockingGroup], true)
      : [];
    const wallDist = hitsWalls.length ? hitsWalls[0].distance : Infinity;
    const hit = hitsEnemies.find((h) => h.distance < wallDist);
    if (!hit) return;

    // find which enemy owns the object that was hit
    const hitObj = hit.object;
    // If the hit object is a child mesh of a templated model, it should have
    // a back-reference to its enemy object in userData.enemy. Otherwise,
    // fall back to matching by root mesh equality for the sphere fallback.
    const enemy =
      hit.object.userData?.enemy ||
      enemies.find((candidate) => {
        if (candidate.mesh === hitObj) return true;
        // check if this enemy group contains the hit object
        return (
          candidate.mesh.getObjectById &&
          candidate.mesh.getObjectById(hitObj.id) !== undefined
        );
      });
    if (!enemy) return;

    const wasAlive = !enemy.dead;
    applyDamage(enemy, COMBAT.HIT_DAMAGE);

    try {
      audio.play("enemy_damage", { volume: 0.9 });
    } catch (err) {
      console.log(err);
    }

    if (wasAlive && enemy.dead) {
      try {
        audio.play("enemy_death", { volume: 0.9 });
      } catch (err) {
        console.error("Failed to play enemy death sound:", err);
      }
    }
  }

  return { enemies, reset, update, performAttack, setFrozen, applyDamage };
}
