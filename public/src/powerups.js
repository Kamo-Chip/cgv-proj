// src/powerups.js
import * as THREE from "three";
import { POWERUP, MOVE } from "./constants.js";
import { gridToWorld } from "./utils.js";

export function initPowerups(scene, maze,onGunPickup) {
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

       const isGun = Math.random() < 0.22; // ~22% chance it's a gun
    if (isGun) {
      // gun visual
      const geo = new THREE.BoxGeometry(0.5, 0.2, 0.35);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        metalness: 0.8,
        roughness: 0.35,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.set(w.x, 0.3, w.z);
      m.rotation.y = Math.random() * Math.PI * 2;
      scene.add(m);
      powerups.push({ mesh: m, gx, gy, taken: false, type: "gun" });
      return;
    }

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
    powerups.push({ mesh: m, gx, gy, taken: false ,type: "jump"});
  }

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
    for (const c of cells) {
      if (placed >= POWERUP.COUNT) break;
      const ok = chosen.every(
        (d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= minCellGap
      );
      if (!ok) continue;
      chosen.push(c);
      createAt(c.x, c.y);
      placed++;
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

        if (p.type === "jump") {
          applyJumpBoost(player);
        } else if (p.type === "gun") {
          // call callback to give gun to player
          if (typeof onGunPickup === "function") {
            // pass the mesh position grid or world pos so main can place/instantiate the gun
            onGunPickup({ gx: p.gx, gy: p.gy, worldPos: p.mesh.position.clone() });
          }
        }
      }

    }

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
