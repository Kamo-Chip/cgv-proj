// src/enemies.js
import * as THREE from "three";
import { ENEMY, COMBAT } from "./constants.js";
import { gridToWorld, worldToGrid } from "./utils.js";
import { audio } from "./audio.js";

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

  // ---------------- RAM behaviour knobs (fallbacks if not defined in ENEMY) ----------------
  const RAM = {
    TRIGGER_DIST: ENEMY.RAM_TRIGGER_DIST ?? 1.6,
    WINDUP_TIME: ENEMY.RAM_WINDUP_TIME ?? 0.22,
    CHARGE_TIME: ENEMY.RAM_CHARGE_TIME ?? 0.18,
    BACKOFF_TIME: ENEMY.RAM_BACKOFF_TIME ?? 0.26,
    COOLDOWN_TIME: ENEMY.RAM_COOLDOWN_TIME ?? 0.32,
    CHARGE_SPEED: ENEMY.RAM_CHARGE_SPEED ?? ENEMY.SPEED * 2.6,
    BACKOFF_SPEED: ENEMY.RAM_BACKOFF_SPEED ?? ENEMY.SPEED * 1.7,
    HIT_RADIUS: ENEMY.RAM_HIT_RADIUS ?? ENEMY.RADIUS + 10,
    DAMAGE: ENEMY.RAM_DAMAGE ?? Math.max(ENEMY.DMG_PER_SEC * 0.6, 5),
  };

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

      // --------- RAM FSM fields ----------
      ramState: "chase", // "chase" | "windup" | "charge" | "backoff" | "cooldown"
      ramT: 0,
      ramDir: { x: 0, z: 0 },
      ramHasHit: false,
      ramSide: Math.random() < 0.5 ? 1 : -1, // kept from your original
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

  function slideOutOfWalls(nx, nz) {
    // pushes the point (nx, nz) out of AABBs and returns the corrected position
    for (const w of walls) {
      const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
      const cz = Math.max(w.min.z, Math.min(nz, w.max.z));
      const ddx = nx - cx,
        ddz = nz - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < ENEMY.RADIUS * ENEMY.RADIUS) {
        const d = Math.sqrt(d2) || 1e-5;
        const overlap = ENEMY.RADIUS - d;
        nx += (ddx / d) * overlap;
        nz += (ddz / d) * overlap;
      }
    }
    return { nx, nz };
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
        let { nx, nz } = slideOutOfWalls(e.mesh.position.x, e.mesh.position.z);
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

  function setFrozen(isFrozen) {
    frozen = isFrozen;
    for (const e of enemies) {
      if (isFrozen) {
        e.mesh.material.color.set(0xcccccc);
        e.mesh.material.emissive.set(0x555555);
      } else {
        e.mesh.material.color.set(0xff5252);
        e.mesh.material.emissive.set(0x550000);
      }
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

  function update(dt, canDealDamage = true) {
    if (frozen) {
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.mesh.material.emissiveIntensity = 0.2 + e.hitFlash * 1.0;
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
      if (e.dead) continue;

      // decay hit flash
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.mesh.material.emissiveIntensity = 0.2 + e.hitFlash * 1.0;

      // sync grid from actual pos
      const here = worldToGrid(e.mesh.position.x, e.mesh.position.z);
      e.gx = here.gx;
      e.gy = here.gy;

      // Direction to player (XZ)
      let tdx = camera.position.x - e.mesh.position.x;
      let tdz = camera.position.z - e.mesh.position.z;
      const tpDist = Math.hypot(tdx, tdz);
      const ux = tpDist > 1e-6 ? tdx / tpDist : 0;
      const uz = tpDist > 1e-6 ? tdz / tpDist : 0;

      // ---------------- RAM FSM ----------------
      if (e.ramState === "chase" && tpDist <= RAM.TRIGGER_DIST) {
        // Start the loop
        e.ramHasHit = false;
        enterRam(e, "windup", RAM.WINDUP_TIME, ux, uz);
      }

      if (e.ramState !== "chase") {
        // Handle windup/charge/backoff/cooldown
        if (e.ramState === "windup") {
          // slight backstep to telegraph
          const bx = -e.ramDir.x * RAM.BACKOFF_SPEED * 0.5 * dt;
          const bz = -e.ramDir.z * RAM.BACKOFF_SPEED * 0.5 * dt;
          let nx = e.mesh.position.x + bx;
          let nz = e.mesh.position.z + bz;
          ({ nx, nz } = slideOutOfWalls(nx, nz));
          e.mesh.position.x = nx;
          e.mesh.position.z = nz;

          e.ramT -= dt;
          if (e.ramT <= 0) {
            e.ramHasHit = false;
            enterRam(e, "charge", RAM.CHARGE_TIME, ux, uz);
            // try {
            //   audio.play?.("enemy_charge", { volume: 0.6 });
            // } catch {}
          }
        } else if (e.ramState === "charge") {
          const sx = e.ramDir.x * RAM.CHARGE_SPEED * dt;
          const sz = e.ramDir.z * RAM.CHARGE_SPEED * dt;
          let nx = e.mesh.position.x + sx;
          let nz = e.mesh.position.z + sz;
          ({ nx, nz } = slideOutOfWalls(nx, nz));
          e.mesh.position.x = nx;
          e.mesh.position.z = nz;

          // check hit once during charge
          if (!e.ramHasHit && canDealDamage) {
            const pdx = camera.position.x - e.mesh.position.x;
            const pdz = camera.position.z - e.mesh.position.z;
            if (Math.hypot(pdx, pdz) <= RAM.HIT_RADIUS) {
              onPlayerDamage(RAM.DAMAGE);
              e.ramHasHit = true;
              // a tiny squash/pulse
              e.mesh.scale.setScalar(1.2);
              setTimeout(() => e.mesh.scale.setScalar(1), 90);
              try {
                audio.play?.("player_damage", { volume: 0.9 });
              } catch(e) {
                console.log("Failed to play player_damage sound:", e);
              }
            }
          }

          e.ramT -= dt;
          if (e.ramT <= 0) {
            enterRam(e, "backoff", RAM.BACKOFF_TIME, e.ramDir.x, e.ramDir.z);
          }
        } else if (e.ramState === "backoff") {
          const bx = -e.ramDir.x * RAM.BACKOFF_SPEED * dt;
          const bz = -e.ramDir.z * RAM.BACKOFF_SPEED * dt;
          let nx = e.mesh.position.x + bx;
          let nz = e.mesh.position.z + bz;
          ({ nx, nz } = slideOutOfWalls(nx, nz));
          e.mesh.position.x = nx;
          e.mesh.position.z = nz;

          e.ramT -= dt;
          if (e.ramT <= 0) {
            enterRam(e, "cooldown", RAM.COOLDOWN_TIME);
          }
        } else if (e.ramState === "cooldown") {
          // hold position (or do subtle drift toward the player)
          const drift = Math.min(tpDist, 0.3); // tiny drift if we're too far
          let nx = e.mesh.position.x + ux * drift * 0.25 * dt;
          let nz = e.mesh.position.z + uz * drift * 0.25 * dt;
          ({ nx, nz } = slideOutOfWalls(nx, nz));
          e.mesh.position.x = nx;
          e.mesh.position.z = nz;

          e.ramT -= dt;
          if (e.ramT <= 0) {
            if (tpDist <= RAM.TRIGGER_DIST * 1.1) {
              // loop again
              e.ramHasHit = false;
              enterRam(e, "windup", RAM.WINDUP_TIME, ux, uz);
            } else {
              // return to chase
              e.ramState = "chase";
            }
          }
        }

        // skip chase/path movement while ramming
        continue;
      }

      // ---------------- Normal chase/wander (when not ramming) ----------------
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
        ({ nx, nz } = slideOutOfWalls(nx, nz));
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
      ({ nx, nz } = slideOutOfWalls(nx, nz));
      e.mesh.position.x = nx;
      e.mesh.position.z = nz;
    }

    // separation
    resolveEnemyOverlaps();

    // (Removed continuous touch damage; damage happens on RAM 'charge' hit only)

    // prune dead & top up
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) {
        scene.remove(enemies[i].mesh);
        enemies.splice(i, 1);
      }
    }
    ensureQuota();

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
    enemy.hp -= COMBAT.HIT_DAMAGE;
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
    }
  }

  return { enemies, reset, update, performAttack, setFrozen };
}
