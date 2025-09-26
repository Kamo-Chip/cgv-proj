// src/powerups.js
import * as THREE from "three";
import { POWERUP, MOVE } from "./constants.js";
import { gridToWorld } from "./utils.js";

export function initPowerups(scene, maze) {
  const powerups = []; // { mesh, gx, gy, taken, type: 'jump'|'freeze' }
  let jumpBoostActive = false;
  let jumpBoostTimeLeft = 0;
  
  // New freeze powerup state
  let freezeActive = false;
  let freezeTimeLeft = 0;

  // HUD elements (simple & decoupled)
  const jumpHud = document.getElementById("jumpHud");
  const jumpTimerEl = document.getElementById("jumpTimer");
  // New freeze HUD elements
  const freezeHud = document.getElementById("freezeHud");
  const freezeTimerEl = document.getElementById("freezeTimer");

  function updateJumpHud() {
    if (!jumpBoostActive) return;
    jumpTimerEl.textContent = jumpBoostTimeLeft.toFixed(1);
  }

  // New function to update freeze HUD
  function updateFreezeHud() {
    if (!freezeActive) return;
    freezeTimerEl.textContent = freezeTimeLeft.toFixed(1);
  }

  function createAt(gx, gy, type = 'jump') {
    const w = gridToWorld(gx, gy);
    
    if (type === 'freeze') {
      // Create snowflake-like geometry using multiple thin cylinders
      const group = new THREE.Group();
      const cylinderGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6);
      const snowMat = new THREE.MeshStandardMaterial({
        color: 0x87ceeb,      // Light blue color
        emissive: 0x4682b4,   // Steel blue emissive
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.3,
      });
      
      // Create 6 spokes for snowflake pattern
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(cylinderGeo, snowMat);
        spoke.rotation.z = (i * Math.PI) / 3; // 60 degree intervals
        group.add(spoke);
      }
      
      // Add cross spokes for more detailed snowflake
      const crossSpoke1 = new THREE.Mesh(cylinderGeo, snowMat);
      crossSpoke1.rotation.x = Math.PI / 2;
      group.add(crossSpoke1);
      
      const crossSpoke2 = new THREE.Mesh(cylinderGeo, snowMat);
      crossSpoke2.rotation.z = Math.PI / 2;
      crossSpoke2.rotation.x = Math.PI / 2;
      group.add(crossSpoke2);
      
      group.position.set(w.x, 0.6, w.z);
      group.castShadow = true;
      scene.add(group);
      powerups.push({ mesh: group, gx, gy, taken: false, type: 'freeze' });
    } else {
      // Original jump powerup code
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
      powerups.push({ mesh: m, gx, gy, taken: false, type: 'jump' });
    }
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

    // Shuffle cells for random placement
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    let jumpPlaced = 0;
    let freezePlaced = 0;
    const minCellGap = 3;
    const chosen = [];
    
    for (const c of cells) {
      // Stop if we've placed all powerups
      if (jumpPlaced >= POWERUP.COUNT && freezePlaced >= POWERUP.FREEZE_COUNT) break;
      
      // Check minimum distance from other powerups
      const ok = chosen.every(
        (d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y) >= minCellGap
      );
      if (!ok) continue;
      
      chosen.push(c);
      
      // Decide which type to place (prioritize freeze powerups first)
      if (freezePlaced < POWERUP.FREEZE_COUNT) {
        createAt(c.x, c.y, 'freeze');
        freezePlaced++;
      } else if (jumpPlaced < POWERUP.COUNT) {
        createAt(c.x, c.y, 'jump');
        jumpPlaced++;
      }
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

  // New function to apply freeze effect
  function applyFreezeEffect() {
    freezeActive = true;
    freezeTimeLeft = POWERUP.FREEZE_DURATION;
    if (freezeHud) {
      freezeHud.style.display = "inline-block";
      updateFreezeHud();
    }
  }

  // New function to clear freeze effect
  function clearFreezeEffect() {
    freezeActive = false;
    freezeTimeLeft = 0;
    if (freezeHud) freezeHud.style.display = "none";
  }

  function update(dt, player, camera) {
    // spin/float animation for all powerups
    for (const p of powerups) {
      if (!p.taken) {
        p.mesh.rotation.y += dt * 1.5;
        p.mesh.position.y =
          0.55 + Math.sin(performance.now() * 0.003 + p.gx * 13.3) * 0.05;
      }
    }

    // pickup detection
    for (const p of powerups) {
      if (p.taken) continue;
      const d = Math.hypot(
        camera.position.x - p.mesh.position.x,
        camera.position.z - p.mesh.position.z
      );
      if (d <= POWERUP.PICKUP_RADIUS) {
        p.taken = true;
        // Visual feedback for pickup
        p.mesh.scale.setScalar(1.4);
        setTimeout(() => scene.remove(p.mesh), 80);
        
        // Apply different effects based on powerup type
        if (p.type === 'freeze') {
          applyFreezeEffect();
        } else {
          applyJumpBoost(player);
        }
      }
    }

    // jump boost timer
    if (jumpBoostActive) {
      jumpBoostTimeLeft -= dt;
      if (jumpBoostTimeLeft <= 0) {
        clearJumpBoost(player);
      } else {
        updateJumpHud();
      }
    }

    // New freeze timer
    if (freezeActive) {
      freezeTimeLeft -= dt;
      if (freezeTimeLeft <= 0) {
        clearFreezeEffect();
      } else {
        updateFreezeHud();
      }
    }
  }

  function reset(player) {
    clearJumpBoost(player);
    clearFreezeEffect(); // Clear freeze effect on reset
    scatter();
  }

  // Export freeze state so enemies can check it
  return { 
    powerups, 
    update, 
    reset, 
    scatter, 
    get isFreezeActive() { return freezeActive; }  // Getter for freeze state
  };
}