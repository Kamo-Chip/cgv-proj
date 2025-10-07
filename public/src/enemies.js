// src/enemies.js
import * as THREE from "three";
import { ENEMY, COMBAT, ENEMY_STATE } from "./constants.js";
import { gridToWorld, worldToGrid, loadModel } from "./utils.js";

// near top: you already have this line
export let ENEMY_MODEL = null;

// load model using your utils.loadModel (non-blocking / single place)
export async function initEnemyModel() {
  if (ENEMY_MODEL) return; // already loaded
  try {
    // loadModel should return the gltf.scene (implementation in utils.js)
    const model = await loadModel("./models/items/enemy.glb");
    // keep the model root as the cache
    ENEMY_MODEL = model;
    // a default scale (tweak if needed)
    ENEMY_MODEL.scale.setScalar(0.8);
    // ensure model meshes cast/receive shadows & have default materials
    ENEMY_MODEL.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        if (!n.material)
          n.material = new THREE.MeshStandardMaterial({ color: 0xff5252 });
      }
    });
    console.log("ENEMY_MODEL loaded");
  } catch (err) {
    console.error("initEnemyModel failed:", err);
    ENEMY_MODEL = null;
  }
}

export function initEnemies(scene, camera, walls, maze, onPlayerDamage) {
  const enemies = []; // { mesh, gx, gy, path, targetIndex, vx, vz, ... }
  const enemyGeo = new THREE.SphereGeometry(0.35, 16, 16);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xff5252,
    emissive: 0x550000,
    emissiveIntensity: 0.2,
    roughness: 0.6,
  });

  const raycaster = new THREE.Raycaster();
  const ndcCenter = new THREE.Vector2(0, 0);

  let timeSinceReplan = 0;
  let fireTimer = 0;
  let frozen = false;

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

  // helper to safely set material props on a group/mesh (you already had similar)
  function setMaterialProperty(object, prop, value) {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat[prop] !== undefined) mat[prop] = value;
          });
        } else {
          if (child.material[prop] !== undefined) child.material[prop] = value;
        }
      }
    });
  }

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
            w.z - e.mesh.position.z
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

    const w = gridToWorld(cell.x, cell.y);

    let mesh;
    if (ENEMY_MODEL) {
      mesh = ENEMY_MODEL.clone(true); // clone the group (true clones children)
      // Optionally adjust clone's scale or orientation here
      mesh.scale.setScalar(0.5); // your desired per-enemy scale
    } else {
      mesh = new THREE.Mesh(enemyGeo, baseMat.clone());
    }

    mesh.position.set(w.x, 0.35, w.z);
    // ensure shadows are enabled on meshes inside the group too (defensive)
    mesh.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });

    scene.add(mesh);

    enemies.push({
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
      state: ENEMY_STATE.PATROL,
    });

    return true;
  }

  function reset() {
    for (const e of enemies) scene.remove(e.mesh);
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

  function resolveEnemyOverlaps() {
    const minDist = ENEMY.RADIUS * 2;
    const minDist2 = minDist * minDist;

    for (let iter = 0; iter < ENEMY.SEPARATION_ITERATIONS; iter++) {
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

      // Wall correction step AFTER overlaps
      for (const e of enemies) {
        if (e.dead) continue;
        let nx = e.mesh.position.x,
          nz = e.mesh.position.z;
        for (const w of walls) {
          const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
          const cz = Math.max(w.min.z, Math.min(nz, w.max.z));
          const ddx = nx - cx,
            ddz = nz - cz,
            d2 = ddx * ddx + ddz * ddz;
          if (d2 < ENEMY.RADIUS * ENEMY.RADIUS) {
            const d = Math.sqrt(d2) || 1e-5;
            const overlap = ENEMY.RADIUS - d;
            nx += (ddx / d) * overlap;
            nz += (ddz / d) * overlap;
          }
        }
        e.mesh.position.x = nx;
        e.mesh.position.z = nz;
      }
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

  // Keep a global store for original colors/emissives
  function setFrozen(isFrozen) {
    frozen = isFrozen;

    for (const e of enemies) {
      e.mesh.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.material) return;

        // Clone materials when freezing to ensure they're unique per enemy
        if (isFrozen && !mesh.userData.originalMaterial) {
          // Store the original material
          mesh.userData.originalMaterial = mesh.material;

          // Clone and modify the material for frozen state
          const frozenMaterial = mesh.material.clone();
          frozenMaterial.color.set(0xcccccc);
          if (frozenMaterial.emissive) {
            frozenMaterial.emissive.set(0x555555);
          }
          mesh.material = frozenMaterial;
        }
        // Restore original material when unfreezing
        else if (!isFrozen && mesh.userData.originalMaterial) {
          mesh.material = mesh.userData.originalMaterial;
          mesh.userData.originalMaterial = null;
        }
      });
    }
  }

  function patrolBehaviour(e, dt, walls, enemies, level = 1) {
    // Save previous position for smooth rotation
    const prevX = e.mesh.position.x;
    const prevZ = e.mesh.position.z;

    e.wanderTimer += dt;
    if (e.wanderTimer >= (e.wanderChangeInterval || 0)) {
      const a = Math.random() * Math.PI * 2;
      e.vx = Math.cos(a) * ENEMY.WANDER_SPEED;
      e.vz = Math.sin(a) * ENEMY.WANDER_SPEED;
      e.wanderChangeInterval = 1 + Math.random() * 2;
      e.wanderTimer = 0;
    }

    // Move intent
    let nx = prevX + (e.vx || 0) * dt;
    let nz = prevZ + (e.vz || 0) * dt;

    // Separation smoothing
    const baseMinDist = ENEMY.RADIUS * 4;
    const minDist = Math.max(
      baseMinDist * (1 - 0.05 * (level - 1)),
      ENEMY.RADIUS * 2
    );
    const minDist2 = minDist * minDist;

    for (const other of enemies) {
      if (other === e || other.dead) continue;
      const dx = nx - other.mesh.position.x;
      const dz = nz - other.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minDist - d) * 0.3;
        nx += (dx / d) * push * dt; // smooth push
        nz += (dz / d) * push * dt;
      }
    }

    // Wall collision smoothing
    for (const w of walls) {
      const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
      const cz = Math.max(w.min.z, Math.min(nz, w.max.z));
      const ddx = nx - cx,
        ddz = nz - cz,
        d2 = ddx * ddx + ddz * ddz;
      if (d2 < ENEMY.RADIUS * ENEMY.RADIUS) {
        const d = Math.sqrt(d2) || 1e-5;
        const overlap = ENEMY.RADIUS - d;
        nx += (ddx / d) * overlap * dt;
        nz += (ddz / d) * overlap * dt;
        if (Math.abs(ddx) > Math.abs(ddz)) e.vx = -(e.vx || 0) * 0.6;
        else e.vz = -(e.vz || 0) * 0.6;
      }
    }

    // Apply movement
    e.mesh.position.set(nx, e.mesh.position.y, nz);

    // Smooth rotation
    const mvx = nx - prevX;
    const mvz = nz - prevZ;
    if (Math.abs(mvx) > 0.001 || Math.abs(mvz) > 0.001) {
      e.mesh.rotation.y = Math.atan2(-mvx, -mvz);
    }
  }

  function chaseBehaviour(e, playerGrid, dt, walls) {
    if (e.inactive) return;

    if (!e.path || e.path.length === 0 || e.targetIndex >= e.path.length) {
      forceReplanForEnemy(e, playerGrid);
      return;
    }

    const prevX = e.mesh.position.x;
    const prevZ = e.mesh.position.z;

    const targetCell = e.path[Math.min(e.targetIndex, e.path.length - 1)];
    const tw = gridToWorld(targetCell.gx, targetCell.gy);

    let dx = tw.x - prevX;
    let dz = tw.z - prevZ;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.02) {
      e.mesh.position.set(tw.x, e.mesh.position.y, tw.z);
      e.gx = targetCell.gx;
      e.gy = targetCell.gy;
      e.targetIndex++;
      return;
    }

    dx /= dist || 1;
    dz /= dist || 1;

    const moveStep = ENEMY.SPEED * dt;
    let nx, nz;

    if (dist > moveStep) {
      nx = prevX + dx * moveStep;
      nz = prevZ + dz * moveStep;
    } else {
      nx = tw.x;
      nz = tw.z;
    }

    // Wall collision smoothing
    for (const w of walls) {
      const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
      const cz = Math.max(w.min.z, Math.min(nz, w.max.z));
      const ddx = nx - cx,
        ddz = nz - cz,
        d2 = ddx * ddx + ddz * ddz;
      if (d2 < ENEMY.RADIUS * ENEMY.RADIUS) {
        const d = Math.sqrt(d2) || 1e-5;
        const overlap = ENEMY.RADIUS - d;
        nx += (ddx / d) * overlap * dt;
        nz += (ddz / d) * overlap * dt;
      }
    }

    e.mesh.position.x = nx;
    e.mesh.position.z = nz;

    const mvx = nx - prevX;
    const mvz = nz - prevZ;
    if (Math.abs(mvx) > 0.001 || Math.abs(mvz) > 0.001) {
      e.mesh.rotation.y = Math.atan2(-mvz, mvx);
    }
  }

  function attackBehaviour(e, camera, dt, onPlayerDamage) {
    const pdx = camera.position.x - e.mesh.position.x;
    const pdz = camera.position.z - e.mesh.position.z;
    const dist = Math.hypot(pdx, pdz);

    if (dist < ENEMY.ATTACK_RADIUS) {
      onPlayerDamage(ENEMY.DMG_PER_SEC * dt);
    }
  }

 function update(dt, canDealDamage = true, currentLevel = 1) {
  if (frozen) {
    for (const e of enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      setMaterialProperty(e.mesh, "emissiveIntensity", 0.2 + e.hitFlash * 1.0);
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) {
        scene.remove(enemies[i].mesh);
        enemies.splice(i, 1);
      }
    }
    ensureQuota();
    if (fireTimer > 0) fireTimer = Math.max(0, fireTimer - dt);
    return;
  }

  timeSinceReplan += dt;
  const pg = worldToGrid(camera.position.x, camera.position.z);

  const activeLimit =
    ENEMY.BASE_ACTIVE_LIMIT +
    (currentLevel - 1) * ENEMY.ACTIVE_INCREASE_PER_LEVEL;

  let activeChasers = 0;

  // Replan path only if enough time has passed
  if (timeSinceReplan >= ENEMY.REPLAN_DT) {
    for (const e of enemies) {
      if (e.dead) continue;
      const distToPlayer = Math.hypot(
        e.mesh.position.x - camera.position.x,
        e.mesh.position.z - camera.position.z
      );

      // Reset state
      if (distToPlayer <= ENEMY.ATTACK_RADIUS) {
        e.state = ENEMY_STATE.ATTACK;
      } else if (distToPlayer <= ENEMY.CHASE_RADIUS) {
        if (activeChasers < activeLimit) {
          e.state = ENEMY_STATE.CHASE;
          forceReplanForEnemy(e, pg);
          activeChasers++;
        } else {
          e.state = ENEMY_STATE.PATROL;
        }
      } else {
        e.state = ENEMY_STATE.PATROL;
      }
    }
    timeSinceReplan = 0;
  }

  let currentFrameChasers = 0;

  for (const e of enemies) {
    if (e.dead) continue;

    e.hitFlash = Math.max(0, e.hitFlash - dt);
    setMaterialProperty(e.mesh, "emissiveIntensity", 0.2 + e.hitFlash * 1.0);

    switch (e.state) {
      case ENEMY_STATE.PATROL:
        patrolBehaviour(e, dt, walls, enemies, currentLevel);
        break;

      case ENEMY_STATE.CHASE:
        if (currentFrameChasers < activeLimit) {
          chaseBehaviour(e, pg, dt, walls);
          currentFrameChasers++;
        } else {
          e.state = ENEMY_STATE.PATROL;
          patrolBehaviour(e, dt, walls, enemies, currentLevel);
        }
        break;

      case ENEMY_STATE.ATTACK:
        attackBehaviour(e, camera, dt, onPlayerDamage);
        break;
    }
  }

  resolveEnemyOverlaps();

  if (canDealDamage) {
    for (const e of enemies) {
      if (e.dead) continue;
      const pdx = camera.position.x - e.mesh.position.x;
      const pdz = camera.position.z - e.mesh.position.z;
      if (
        Math.hypot(pdx, pdz) < ENEMY.RADIUS &&
        e.state === ENEMY_STATE.ATTACK
      ) {
        onPlayerDamage(ENEMY.DMG_PER_SEC * dt);
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead) {
      scene.remove(enemies[i].mesh);
      enemies.splice(i, 1);
    }
  }

  ensureQuota();

  if (fireTimer > 0) fireTimer = Math.max(0, fireTimer - dt);
}


  // performAttack: recursive raycast + find parent enemy when a child mesh is hit
  function performAttack(wallGroup) {
    if (fireTimer > 0) return;
    fireTimer = COMBAT.FIRE_COOLDOWN;
    raycaster.setFromCamera(ndcCenter, camera);
    raycaster.far = COMBAT.RAYCAST_MAX;

    // pass top-level enemy meshes — intersectObjects(..., true) will recurse into children
    const aliveMeshes = enemies.filter((e) => !e.dead).map((e) => e.mesh);
    // NOTE: use recursive = true so children inside GLTF groups are tested
    const hitsEnemies = raycaster.intersectObjects(aliveMeshes, true);
    const hitsWalls = raycaster.intersectObjects([wallGroup], true);
    const wallDist = hitsWalls.length ? hitsWalls[0].distance : Infinity;
    const hit = hitsEnemies.find((h) => h.distance < wallDist);
    if (!hit) return;

    // find which enemy owns the object that was hit
    const hitObj = hit.object;
    const enemy = enemies.find((e) => {
      if (e.mesh === hitObj) return true;
      // check if this enemy group contains the hit object
      return (
        e.mesh.getObjectById && e.mesh.getObjectById(hitObj.id) !== undefined
      );
    });
    if (!enemy) return;

    enemy.hp -= COMBAT.HIT_DAMAGE;
    enemy.hitFlash = 0.2;
    // animate (scale the top-level group)
    setMaterialProperty(enemy.mesh, "emissiveIntensity", 1.0);
    setTimeout(
      () => setMaterialProperty(enemy.mesh, "emissiveIntensity", 0.2),
      80
    );
    if (enemy.hp <= 0 && !enemy.dead) enemy.dead = true;
  }

  return { enemies, reset, update, performAttack, setFrozen };
}
