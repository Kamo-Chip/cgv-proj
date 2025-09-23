// src/powerups.js
import * as THREE from 'three';
import { POWERUP, MOVE } from './constants.js';
import { gridToWorld } from './utils.js';

function cellId(x, y) { return `${x},${y}`; }

/**
 * Power-ups module (jump boost).
 * - Robust scatter that always places the target count (relaxes spacing if needed).
 * - Excludes start (1,1) and any cells passed via opts.excludeCells (e.g., door).
 * - Safe HUD updates and timer management.
 */
export function initPowerups(scene, maze, opts = {}) {
  const powerups = []; // { mesh, gx, gy, taken }
  let jumpBoostActive = false;
  let jumpBoostTimeLeft = 0;

  // HUD (optional)
  const jumpHud = document.getElementById('jumpHud');
  const jumpTimerEl = document.getElementById('jumpTimer');

  function updateJumpHud() {
    if (!jumpBoostActive || !jumpTimerEl) return;
    jumpTimerEl.textContent = jumpBoostTimeLeft.toFixed(1);
  }

  function createAt(gx, gy) {
    const w = gridToWorld(gx, gy);
    const geo = new THREE.TorusKnotGeometry(0.3, 0.09, 64, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7c9cff,
      emissive: 0x2a49ff,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.2,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.position.set(w.x, 0.6, w.z);
    scene.add(m);
    powerups.push({ mesh: m, gx, gy, taken: false });
  }

  // Build exclusion set (strings "gx,gy")
  const excluded = new Set(opts.excludeCells || []);
  excluded.add(cellId(1, 1)); // always exclude player spawn

  function scatter() {
    // Clear old
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;

    // Collect valid passage cells (inside border)
    const H = maze.length, W = maze[0].length;
    const cells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (maze[y][x] === 1 && !excluded.has(cellId(x, y))) {
          cells.push({ x, y });
        }
      }
    }

    if (!cells.length || POWERUP.COUNT <= 0) return;

    // Shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    // Try with decreasing Manhattan spacing until we place enough
    const target = Math.max(0, POWERUP.COUNT | 0);
    const gapCandidates = [3, 2, 1, 0];
    let placed = 0;

    for (const gap of gapCandidates) {
      if (placed >= target) break;
      const chosen = [];
      for (const c of cells) {
        if (placed >= target) break;
        const ok = chosen.every(d => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= gap);
        if (!ok) continue;
        chosen.push(c);
        createAt(c.x, c.y);
        placed++;
      }
    }

    // Fallback: random drop if still short
    while (placed < target && cells.length) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      createAt(c.x, c.y);
      placed++;
    }
  }

  function applyJumpBoost(player) {
    jumpBoostActive = true;
    jumpBoostTimeLeft = POWERUP.DURATION;
    player.GRAVITY = MOVE.BASE_GRAVITY * POWERUP.GRAVITY_MULT;
    player.JUMP_V  = MOVE.BASE_JUMP_V  * POWERUP.JUMP_MULT;
    if (jumpHud) {
      jumpHud.style.display = 'inline-block';
      updateJumpHud();
    }
  }

  function clearJumpBoost(player) {
    jumpBoostActive = false;
    jumpBoostTimeLeft = 0;
    player.GRAVITY = MOVE.BASE_GRAVITY;
    player.JUMP_V  = MOVE.BASE_JUMP_V;
    if (jumpHud) jumpHud.style.display = 'none';
  }

  function update(dt, player, camera) {
    // Spin/float
    for (const p of powerups) {
      if (!p.taken) {
        p.mesh.rotation.y += dt * 1.5;
        p.mesh.position.y = 0.55 + Math.sin(performance.now() * 0.003 + p.gx * 13.3) * 0.05;
      }
    }

    // Pickup
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

    // Timer tick
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

  // Ensure initial placement even if reset() hasn't run yet
  scatter();

  return { powerups, update, reset, scatter };
}
