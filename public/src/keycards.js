// src/keycards.js
import * as THREE from 'three';
import { KEYS } from './constants.js';
import { gridToWorld } from './utils.js';

function cellId(x, y) { return `${x},${y}`; }

export function initKeycards(scene, maze, opts = {}) {
  const keycards = []; // { mesh, gx, gy, taken }
  let collected = 0;

  // --- HUD chip (created dynamically) ---
  // We'll tuck it next to the jump HUD if present.
  const powerupsHud = document.getElementById('powerupsHud');
  const keyHud = document.createElement('div');
  keyHud.style.cssText = `
    padding: 4px 8px;
    border-radius: 8px;
    background: #142131;
    border: 1px solid #2c3a4d;
    font-size: 12px;
  `;
  keyHud.textContent = `Keys: ${collected}/${KEYS.REQUIRED}`;
  if (powerupsHud) powerupsHud.appendChild(keyHud);

  function updateHud() {
    keyHud.textContent = `Keys: ${collected}/${KEYS.REQUIRED}`;
  }

  function createAt(gx, gy) {
    // A shiny green “card” (thin box)
    const w = gridToWorld(gx, gy);
    const geo = new THREE.BoxGeometry(0.45, 0.06, 0.30);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      emissive: 0x2aff77,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.15,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.position.set(w.x, 0.45, w.z);
    // a little tilt so it's visible
    m.rotation.y = Math.random() * Math.PI * 2;
    m.rotation.x = -0.25;
    scene.add(m);
    keycards.push({ mesh: m, gx, gy, taken: false, t0: Math.random() * 1000 });
  }

  const excluded = new Set(opts.excludeCells || []);
  excluded.add(cellId(1, 1)); // exclude player start

  function scatter() {
    // clear old
    for (const k of keycards) scene.remove(k.mesh);
    keycards.length = 0;
    collected = 0;
    updateHud();

    // gather passage cells
    const H = maze.length, W = maze[0].length;
    const cells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (maze[y][x] === 1 && !excluded.has(cellId(x, y))) {
          cells.push({ x, y });
        }
      }
    }
    if (cells.length === 0) return;

    // shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    // pick first N distinct cells (no spacing constraints needed)
    const target = Math.min(KEYS.REQUIRED, cells.length);
    for (let i = 0; i < target; i++) {
      createAt(cells[i].x, cells[i].y);
    }
  }

  function update(dt, camera) {
    // idle animation + pickup
    const now = performance.now();
    for (const k of keycards) {
      if (k.taken) continue;

      // hover/float animation
      const bob = Math.sin((now + k.t0) * 0.003) * 0.04;
      k.mesh.position.y = 0.45 + bob;

      // pickup
      const d = Math.hypot(
        camera.position.x - k.mesh.position.x,
        camera.position.z - k.mesh.position.z
      );
      if (d <= KEYS.PICKUP_RADIUS) {
        k.taken = true;
        collected++;
        updateHud();

        // feedback
        k.mesh.scale.setScalar(1.25);
        setTimeout(() => scene.remove(k.mesh), 90);
      }
    }
  }

  function reset() {
    scatter();
  }

  // initial scatter so they exist before first reset()
  scatter();

  return {
    keycards,
    update,
    reset,
    get collected() { return collected; },
  };
}
