// src/enemies.js
import * as THREE from "three";
import { ENEMY, COMBAT } from "./constants.js";
import { gridToWorld, worldToGrid } from "./utils.js";

export function initEnemies(scene, camera, walls, maze, onPlayerDamage) {
<<<<<<< Updated upstream
=======
  // ---- Tunables (safe defaults; override in constants.js if you want) ----
  const MIN_PLAYER_DIST = ENEMY.MIN_PLAYER_DIST ?? 0.9; // personal-space bubble (m)
  const BASE_RADIUS = ENEMY.RADIUS ?? 0.35; // enemy sphere radius (m)
  const ATTACK_RADIUS = Math.max(
    ENEMY.ATTACK_RADIUS ?? BASE_RADIUS,
    MIN_PLAYER_DIST + 0.02
  );
  const VERTICAL_ATTACK_TOL = ENEMY.VERTICAL_ATTACK_TOLERANCE ?? 0.45; // how high off the ground before you're "airborne" for damage

  const ENEMY_MAX_HP = ENEMY.MAX_HP ?? 100;

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

>>>>>>> Stashed changes
  const enemies = []; // { mesh, gx, gy, path, targetIndex, vx, vz, ... }
  const enemyGeo = new THREE.SphereGeometry(0.35, 16, 16);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xff5252,
    emissive: 0x550000,
    emissiveIntensity: 0.2,
    roughness: 0.6,
  });

  const barsLayer =
    document.getElementById("enemyBars") ??
    (() => {
      const layer = document.createElement("div");
      layer.id = "enemyBars";
      layer.className = "enemy-bars";
      document.body.appendChild(layer);
      return layer;
    })();
  const HEALTH_BAR_OFFSET_Y = ENEMY.HEALTH_BAR_OFFSET ?? BASE_RADIUS * 1.8;
  const barWorldPos = new THREE.Vector3();
  const barScreenPos = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const ndcCenter = new THREE.Vector2(0, 0);
  const LOS_START_EPS = 1e-4;
  const LOS_END_EPS = 0.02;

  function createEnemyHealthBar() {
    if (!barsLayer) return null;
    const root = document.createElement("div");
    root.className = "enemy-bar";
    root.innerHTML =
      '<div class="enemy-bar__health"></div><div class="enemy-bar__lost"></div><div class="enemy-bar__heal"></div>';
    const health = root.querySelector(".enemy-bar__health");
    const lost = root.querySelector(".enemy-bar__lost");
    const heal = root.querySelector(".enemy-bar__heal");
    if (!health || !lost || !heal) return null;
    lost._resetTimeout = null;
    barsLayer.appendChild(root);
    return { root, health, lost, heal, removed: false, removeTimeout: null };
  }

  function destroyEnemyHealthBar(bar, immediate = false) {
    if (!bar || bar.removed) return;
    bar.removed = true;
    if (bar.removeTimeout) {
      clearTimeout(bar.removeTimeout);
      bar.removeTimeout = null;
    }
    if (bar.lost && bar.lost._resetTimeout) {
      clearTimeout(bar.lost._resetTimeout);
      bar.lost._resetTimeout = null;
    }
    const remover = () => {
      if (bar.root && bar.root.parentElement) {
        bar.root.parentElement.removeChild(bar.root);
      }
      bar.root = null;
      bar.health = null;
      bar.lost = null;
      bar.heal = null;
      bar.removeTimeout = null;
    };
    if (immediate) {
      remover();
      return;
    }
    if (bar.root) {
      bar.root.classList.add("enemy-bar--dead");
    }
    bar.removeTimeout = setTimeout(remover, 260);
  }

  function segmentIntersectsAABB2D(sx, sz, ex, ez, box) {
    let tMin = 0;
    let tMax = 1;
    const dx = ex - sx;
    const dz = ez - sz;

    if (Math.abs(dx) < 1e-6) {
      if (sx < box.min.x || sx > box.max.x) return null;
    } else {
      const invDx = 1 / dx;
      let t1 = (box.min.x - sx) * invDx;
      let t2 = (box.max.x - sx) * invDx;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    if (Math.abs(dz) < 1e-6) {
      if (sz < box.min.z || sz > box.max.z) return null;
    } else {
      const invDz = 1 / dz;
      let t1 = (box.min.z - sz) * invDz;
      let t2 = (box.max.z - sz) * invDz;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    if (tMax < 0 || tMin > 1) return null;
    return { enter: tMin, exit: tMax };
  }

  function hasLineOfSight(startVec, endVec) {
    const sx = startVec.x;
    const sz = startVec.z;
    const ex = endVec.x;
    const ez = endVec.z;
    for (const w of walls) {
      const hit = segmentIntersectsAABB2D(sx, sz, ex, ez, w);
      if (!hit) continue;
      if (hit.enter <= LOS_START_EPS) continue;
      if (hit.enter >= 1 - LOS_END_EPS) continue;
      return false;
    }
    return true;
  }

  function updateEnemyHealthBar(enemy, prevHp = enemy.hp) {
    const bar = enemy.bar;
    if (!bar || !bar.health) return;
    const maxHp = enemy.maxHp ?? ENEMY_MAX_HP;
    const clampedPrev = Math.max(0, prevHp);
    const clampedCurr = Math.max(0, enemy.hp);
    const prevPct = (clampedPrev / maxHp) * 100;
    const pct = (clampedCurr / maxHp) * 100;
    bar.health.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    const diff = prevPct - pct;
    if (bar.lost && diff > 0.5) {
      const width = Math.min(100, Math.max(0, diff));
      bar.lost.classList.add("enemy-bar__lost--active");
      bar.lost.style.opacity = "1";
      bar.lost.style.width = `${width}%`;
      bar.lost.style.right = `${Math.max(0, 100 - prevPct)}%`;
      if (bar.lost._resetTimeout) clearTimeout(bar.lost._resetTimeout);
      bar.lost._resetTimeout = setTimeout(() => {
        if (!bar.lost) return;
        bar.lost.classList.remove("enemy-bar__lost--active");
        bar.lost.style.opacity = "0";
        bar.lost.style.width = "0%";
      }, 420);
    }

    if (clampedCurr <= 0 && bar.root) {
      bar.root.classList.add("enemy-bar--dead");
    }
  }

  function updateEnemyBarPosition(enemy) {
    const bar = enemy.bar;
    if (!bar || !bar.root || enemy.dead) {
      if (bar?.root) bar.root.classList.remove("enemy-bar--visible");
      return;
    }
    barWorldPos.copy(enemy.mesh.position);
    barWorldPos.y += HEALTH_BAR_OFFSET_Y;
    barScreenPos.copy(barWorldPos).project(camera);

    if (barScreenPos.z < -1 || barScreenPos.z > 1) {
      bar.root.classList.remove("enemy-bar--visible");
      return;
    }

    const screenX = (barScreenPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-barScreenPos.y * 0.5 + 0.5) * window.innerHeight;

    if (
      screenX < 0 ||
      screenX > window.innerWidth ||
      screenY < 0 ||
      screenY > window.innerHeight
    ) {
      bar.root.classList.remove("enemy-bar--visible");
      return;
    }

    if (!hasLineOfSight(camera.position, enemy.mesh.position)) {
      bar.root.classList.remove("enemy-bar--visible");
      return;
    }

    bar.root.style.left = `${screenX}px`;
    bar.root.style.top = `${screenY}px`;
    bar.root.classList.add("enemy-bar--visible");
  }

  let timeSinceReplan = 0;
  let fireTimer = 0;

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

  function spawnEnemy() {
    let cell = null;
    for (let i = 0; i < ENEMY.MAX_SPAWN_TRIES && !cell; i++)
      cell = chooseSpawnCell();
    if (!cell) return false;
    const w = gridToWorld(cell.x, cell.y);
    const mesh = new THREE.Mesh(enemyGeo, baseMat.clone());
    mesh.castShadow = true;
    mesh.position.set(w.x, 0.35, w.z);
    scene.add(mesh);
    const bar = createEnemyHealthBar();
    const enemy = {
      mesh,
      gx: cell.x,
      gy: cell.y,
      path: [],
      targetIndex: 0,
      vx: 0,
      vz: 0,
      wanderTimer: 0,
      wanderChangeInterval: 1 + Math.random() * 2,
      hp: ENEMY_MAX_HP,
      maxHp: ENEMY_MAX_HP,
      hitFlash: 0,
      dead: false,
      lastWaypointDist: Infinity,
      noProgressTime: 0,
<<<<<<< Updated upstream
    });
=======

      // --------- RAM FSM fields ----------
      ramState: "chase", // "chase" | "windup" | "charge" | "backoff" | "cooldown"
      ramT: 0,
      ramDir: { x: 0, z: 0 },
      ramHasHit: false,
      ramSide: Math.random() < 0.5 ? 1 : -1, // kept from your original
      bar,
    };
    enemies.push(enemy);
    if (enemy.bar) updateEnemyHealthBar(enemy, enemy.maxHp);
    if (enemy.bar) updateEnemyBarPosition(enemy);
>>>>>>> Stashed changes
    return true;
  }

  function reset() {
    for (const e of enemies) {
      scene.remove(e.mesh);
      if (e.bar) {
        destroyEnemyHealthBar(e.bar, true);
        e.bar = null;
      }
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
      // keep enemies out of walls
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

  function update(dt, canDealDamage = true) {
<<<<<<< Updated upstream
=======
    // continuously learn the "ground eye height"
    updateEyeGroundBaseline();

    const airborneOffset = Math.abs(playerVerticalOffsetFromGround());
    const canHitByHeight = airborneOffset <= VERTICAL_ATTACK_TOL;

    if (frozen) {
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.mesh.material.emissiveIntensity = 0.2 + e.hitFlash * 1.0;
      }
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].dead) {
          scene.remove(enemies[i].mesh);
          if (enemies[i].bar) {
            destroyEnemyHealthBar(enemies[i].bar, true);
            enemies[i].bar = null;
          }
          enemies.splice(i, 1);
        }
      }
      for (const e of enemies) updateEnemyBarPosition(e);
      ensureQuota();
      if (fireTimer > 0) fireTimer = Math.max(0, fireTimer - dt);
      return;
    }

>>>>>>> Stashed changes
    timeSinceReplan += dt;
    const pg = worldToGrid(camera.position.x, camera.position.z);

    // periodic replan
    if (timeSinceReplan >= ENEMY.REPLAN_DT) {
      for (const e of enemies) {
        if (e.dead) continue;
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
      if (e.dead) continue;

      // decay hit flash
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.mesh.material.emissiveIntensity = 0.2 + e.hitFlash * 1.0;

      // sync grid from actual pos
      const here = worldToGrid(e.mesh.position.x, e.mesh.position.z);
      e.gx = here.gx;
      e.gy = here.gy;

      if (!e.path || e.path.length === 0) {
        // wander
        e.wanderTimer = (e.wanderTimer || 0) + dt;
        if (e.wanderTimer >= (e.wanderChangeInterval || 0)) {
          const a = Math.random() * Math.PI * 2;
          e.vx = Math.cos(a) * ENEMY.WANDER_SPEED;
          e.vz = Math.sin(a) * ENEMY.WANDER_SPEED;
          e.wanderChangeInterval = 1 + Math.random() * 2;
          e.wanderTimer = 0;
        }
        let nx = e.mesh.position.x + (e.vx || 0) * dt;
        let nz = e.mesh.position.z + (e.vz || 0) * dt;
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
            // simple bounce
            if (Math.abs(ddx) > Math.abs(ddz)) e.vx = -(e.vx || 0) * 0.6;
            else e.vz = -(e.vz || 0) * 0.6;
          }
        }
        e.mesh.position.set(nx, e.mesh.position.y, nz);
        continue;
      }

      const targetCell = e.path[Math.min(e.targetIndex, e.path.length - 1)];
      const tw = gridToWorld(targetCell.gx, targetCell.gy);
      let dx = tw.x - e.mesh.position.x,
        dz = tw.z - e.mesh.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > e.lastWaypointDist - 0.001) e.noProgressTime += dt;
      else e.noProgressTime = 0;
      e.lastWaypointDist = dist;

      if (e.noProgressTime > 0.6) {
        forceReplanForEnemy(e, pg);
        continue;
      }

      if (dist < 0.02) {
        e.mesh.position.set(tw.x, e.mesh.position.y, tw.z);
        e.gx = targetCell.gx;
        e.gy = targetCell.gy;
        e.lastWaypointDist = Infinity;
        e.noProgressTime = 0;
        if (e.targetIndex < e.path.length - 1) e.targetIndex++;
        continue;
      }

      dx /= dist || 1;
      dz /= dist || 1;
      let nx = e.mesh.position.x + dx * ENEMY.SPEED * dt;
      let nz = e.mesh.position.z + dz * ENEMY.SPEED * dt;
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

    // separation + touch damage
    resolveEnemyOverlaps();

<<<<<<< Updated upstream
    if (canDealDamage) {
=======
    for (const e of enemies) updateEnemyBarPosition(e);

    // DAMAGE: must be close horizontally AND not airborne (by calibrated offset)
    if (canDealDamage && canHitByHeight) {
>>>>>>> Stashed changes
      for (const e of enemies) {
        if (e.dead) continue;
        const pdx = camera.position.x - e.mesh.position.x;
        const pdz = camera.position.z - e.mesh.position.z;
        if (Math.hypot(pdx, pdz) < ENEMY.RADIUS) {
          onPlayerDamage(ENEMY.DMG_PER_SEC * dt);
        }
      }
    }

    // prune dead & top up
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) {
        scene.remove(enemies[i].mesh);
        if (enemies[i].bar) {
          destroyEnemyHealthBar(enemies[i].bar, true);
          enemies[i].bar = null;
        }
        enemies.splice(i, 1);
      }
    }
    ensureQuota();

    // cooldown tick
    if (fireTimer > 0) fireTimer = Math.max(0, fireTimer - dt);
  }

  function performAttack(wallGroup) {
    if (fireTimer > 0) return;
    fireTimer = COMBAT.FIRE_COOLDOWN;
    raycaster.setFromCamera(ndcCenter, camera);
    raycaster.far = COMBAT.RAYCAST_MAX;

    const aliveMeshes = enemies.filter((e) => !e.dead).map((e) => e.mesh);
    const hitsEnemies = raycaster.intersectObjects(aliveMeshes, false);
    const hitsWalls = raycaster.intersectObjects([wallGroup], true);
    const wallDist = hitsWalls.length ? hitsWalls[0].distance : Infinity;
    const hit = hitsEnemies.find((h) => h.distance < wallDist);
    if (!hit) return;

    const enemy = enemies.find((e) => e.mesh === hit.object);
    if (!enemy) return;
<<<<<<< Updated upstream
    enemy.hp -= COMBAT.HIT_DAMAGE;
    enemy.hitFlash = 0.2;
    enemy.mesh.scale.setScalar(1.12);
    setTimeout(() => enemy.mesh.scale.setScalar(1), 80);
    if (enemy.hp <= 0 && !enemy.dead) enemy.dead = true;
=======
    const prevHp = enemy.hp;
    enemy.hp = Math.max(0, enemy.hp - COMBAT.HIT_DAMAGE);
    updateEnemyHealthBar(enemy, prevHp);
    enemy.hitFlash = 0.5;
    enemy.mesh.scale.setScalar(1.2);
    setTimeout(() => enemy.mesh.scale.setScalar(1), 100);
    try {
      audio.play("enemy_damage", { volume: 0.9 });
    } catch (e) {
      console.log(e);
    }
    if (enemy.hp <= 0 && !enemy.dead) {
      try {
        audio.play("enemy_death", { volume: 0.9 });
      } catch (e) {
        console.error("Failed to play enemy death sound:", e);
      }
      enemy.dead = true;
      if (enemy.bar) {
        destroyEnemyHealthBar(enemy.bar);
        enemy.bar = null;
      }
    }
>>>>>>> Stashed changes
  }

  return { enemies, reset, update, performAttack };
}
