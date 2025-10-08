import * as THREE from "three";
import { audio } from "./audio.js";
import { MAZE } from "./constants.js";
import { createLookControls } from "./controls.js";
import { initEnemies } from "./enemies.js";
import {
  buildKeys,
  buildWalls,
  generateKeys,
  generateMaze,
  updateKeys,
} from "./maze.js";
import { createMinimap } from "./minimap.js";
import { Player } from "./player.js";
import { initPowerups } from "./powerups.js";
import { createScene } from "./scene.js";
import { createHUD } from "./ui.js";
import { gridToWorld } from "./utils.js";
import { initWeapons } from "./weapons.js";

const { scene, renderer, camera } = createScene();
const hud = createHUD();

// Create look controls (pointer lock + look state) — required by Player and other systems
const { look, lockPointer } = createLookControls(renderer, camera);

import { createCameraShake } from "./scene.js";
const cameraShake = createCameraShake(camera);

import { createThirdPersonCamera } from "./controls.js";

// Player model (the cube for third-person view)
const playerModelGeo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
const playerModelMat = new THREE.MeshStandardMaterial({
  color: 0xeeeeee,
  roughness: 0.8,
});
const playerModel = new THREE.Mesh(playerModelGeo, playerModelMat);
playerModel.castShadow = true;
scene.add(playerModel);

let cameraMode = "first"; // 'first' or 'third'
let thirdPersonCam = null;

// Create a separate Vector3 to hold the player's true position.
// The Player class will update the camera's position, we'll copy it here,
// and the third-person camera will use this as its target.
const playerPositionForCam = new THREE.Vector3();
thirdPersonCam = createThirdPersonCamera(camera, playerPositionForCam);

// Initialize audio (do not resume automatically; wait for user gesture)
// We'll load sounds but not start the AudioContext until user interaction.
(async () => {
  try {
    await audio.loadSounds({
      pistol_attack: "./sounds/pistol_attack.wav",
      pistol_pick: "./sounds/pistol_pick.wav",
      powerup_pick: "./sounds/powerup_pick.wav",
      compass_pick: "./sounds/powerup_pick.wav",
      knife_pick: "./sounds/knife_pick.wav",
      knife_attack: "./sounds/knife_attack.wav",
      enemy_damage: "./sounds/enemy_damage.wav",
      pistol_dry: "./sounds/pistol_dry.wav",
      enemy_death: "./sounds/enemy_death.wav",
      key_pick: "./sounds/key_pick.wav",
      level_win: "./sounds/level_win.wav",
      level_lose: "./sounds/level_lose.wav",
      player_damage: "./sounds/player_damage.wav",
      enemy_charge: "./sounds/enemy_charge.wav",
      player_jump: "./sounds/player_jump.wav",
      player_jump_high: "./sounds/player_jump_high.wav",
      player_step_1: "./sounds/player_step_1.wav",
      player_step_2: "./sounds/player_step_2.wav",
    });
  } catch (e) {
    console.warn("Audio load failed (ok for dev):", e);
  }
})();

// Hook HUD settings controls to audio manager
hud.onMasterVol((v) => audio.setMasterVolume(v));
hud.onSfxVol((v) => audio.setSfxVolume(v));
hud.onMusicVol((v) => audio.setMusicVolume(v));
hud.onToggleAudio((enabled) => audio.toggleEnabled(enabled));

if (hud.onCloseSettings) hud.onCloseSettings(() => hud.showSettings(false));

// Ensure audio context is resumed on first user input (gesture required on many browsers)
function onFirstGesture() {
  audio.resume().catch(() => {});
  // play a silent buffer to unlock audio on some mobile browsers
  try {
    if (audio.ctx) {
      const s = audio.ctx.createBufferSource();
      const buf = audio.ctx.createBuffer(1, 1, audio.ctx.sampleRate);
      s.buffer = buf;
      s.connect(audio.ctx.destination);
      s.start();
    }
  } catch (e) {}
  window.removeEventListener("pointerdown", onFirstGesture);
  window.removeEventListener("keydown", onFirstGesture);
}
window.addEventListener("pointerdown", onFirstGesture);
window.addEventListener("keydown", onFirstGesture);

// Maze + walls
const maze = generateMaze();
const { wallGroup, walls } = buildWalls(scene, maze);

// Door
const DOOR_COLOR = 0x46ff7a;
const DOOR_EMISSIVE = 0x1bff66;
const DOOR_W = MAZE.CELL * 0.9;
const DOOR_H = MAZE.WALL_H * 0.9;
const DOOR_T = MAZE.CELL * 0.2;
const exitGX = maze[0].length - 2;
const exitGY = maze.length - 2;

const doorMat = new THREE.MeshStandardMaterial({
  color: DOOR_COLOR,
  emissive: DOOR_EMISSIVE,
  emissiveIntensity: 0.35,
});
const doorGeo = new THREE.BoxGeometry(DOOR_W, DOOR_H, DOOR_T);
const door = new THREE.Mesh(doorGeo, doorMat);
door.castShadow = true;
const exitWorld = gridToWorld(exitGX, exitGY);
door.position.set(
  exitWorld.x,
  DOOR_H / 2,
  exitWorld.z + MAZE.CELL / 2 - DOOR_T / 2
);
scene.add(door);
let doorOpen = false;
let doorAnimY = door.position.y;

// Player
const player = new Player(camera, walls, look, hud);
player.setHealth(100);
player.resetToStart(1, 1, door.position);
// Initialize our position tracker
playerPositionForCam.copy(camera.position);

// Enemies
let lost = false,
  won = false;
function onPlayerDamage(dmg) {
  if (lost || won) return;

  hud.triggerDamageFlash();

  player.setHealth(player.health - dmg);
  cameraShake.trigger(dmg * 0.015, 8);
  if (player.health <= 0 && !lost) {
    try {
      audio.play("level_lose", { volume: 0.9 });
    } catch (e) {
      console.error("Failed to play level_lose sound:", e);
    }
    lost = true;
    hud.showLose();
  }
}
const enemiesCtl = initEnemies(scene, camera, wallGroup, walls, maze, onPlayerDamage);

// Powerups
const powerupsCtl = initPowerups(scene, maze, enemiesCtl);

// Weapons
const weaponsCtl = initWeapons(scene, maze, walls, enemiesCtl, hud, camera);

// Minimap
const minimap = createMinimap(
  maze,
  door,
  enemiesCtl.enemies,
  powerupsCtl.powerups,
  weaponsCtl.weapons,
  camera,
  look,
  powerupsCtl.getCompassState
);

// Keys
const NUM_KEYS = 1; // Adjustable number of keys
const keys = generateKeys(maze, NUM_KEYS);
let keyMeshes = []; // populated asynchronously by buildKeys

hud.updateKeys(0, NUM_KEYS);

// Reset flow
async function resetGame() {
  won = false;
  lost = false;
  hud.hideWin();
  hud.hideLose();
  player.setHealth(100);
  player.resetToStart(1, 1, door.position);
  // Sync position tracker on reset
  playerPositionForCam.copy(camera.position);
  player.resetKeys();
  enemiesCtl.reset();
  powerupsCtl.reset(player);
  weaponsCtl.reset(player);

  // Remove old keys
  for (const k of keyMeshes) scene.remove(k.mesh);
  // Generate new keys
  keys.splice(0, keys.length, ...generateKeys(maze, NUM_KEYS));
  keyMeshes = await buildKeys(scene, keys);
  // assign a stable id to each key mesh so removing items from the array
  // won't change the identity used for collection checks
  for (let idx = 0; idx < keyMeshes.length; idx++) {
    keyMeshes[idx].id = idx;
  }
  hud.updateKeys(0, NUM_KEYS);
  window.keyMeshes = keyMeshes;
  door.position.y = DOOR_H / 2;
  doorOpen = false;
  doorAnimY = door.position.y;
  if (document.pointerLockElement !== renderer.domElement) hud.showStart(true);
}

// Pointer lock & overlays
hud.playBtn.addEventListener("click", () => {
  hud.showStart(false);
  hud.showSettings(false);
  lockPointer();
});

hud.settingsBtn.addEventListener("click", () => {
  hud.showSettings(true);
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== renderer.domElement && !won && !lost) {
    hud.showStart(true);
  }
});

// Toggle camera mode with 'V' key
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "v") {
    cameraMode = cameraMode === "first" ? "third" : "first";
    if (cameraMode === "first") {
      // Reset first-person camera orientation
      camera.quaternion.setFromEuler(
        new THREE.Euler(look.pitch, look.yaw, 0, "YXZ")
      );
    }
  }
  // ... existing keydown code (R key) ...
});

// Input: R to reset, click to shoot when locked
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") resetGame();
});
addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  const handled = weaponsCtl.fire(enemiesCtl);
  if (!handled) {
    enemiesCtl.performAttack(wallGroup);
  }
});

// Check key collection
function checkKeyCollection() {
  for (let i = keyMeshes.length - 1; i >= 0; i--) {
    const k = keyMeshes[i];
    const dist = Math.hypot(
      camera.position.x - k.mesh.position.x,
      camera.position.z - k.mesh.position.z
    );
    // use stable id stored on the mesh object (fall back to array index if missing)
    const keyId = typeof k.id === "number" ? k.id : i;
    if (dist < 0.7 && !player.collectedKeys.has(keyId)) {
      try {
        audio.play("key_pick", { volume: 0.9 });
      } catch (e) {
        console.error("Failed to play key pick sound:", e);
      }
      console.log("Collecting key", keyId);
      console.log("Player keys before:", player.collectedKeys);
      player.collectKey(keyId);
      console.log("Player keys after:", player.collectedKeys);
      scene.remove(k.mesh);
      keyMeshes.splice(i, 1);
      hud.updateKeys(player.collectedKeys.size, NUM_KEYS);
    }
  }
}

// Start (ensure keys are loaded before animation)
async function startGame() {
  await resetGame();

  // Animate
  let last = performance.now();
  function tick(now = performance.now()) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (document.pointerLockElement === renderer.domElement && !won && !lost) {
      // Before running player logic, ensure the camera is at the player's actual position.
      camera.position.copy(playerPositionForCam);
      camera.quaternion.setFromEuler(
        new THREE.Euler(look.pitch, look.yaw, 0, "YXZ")
      );

      // Now, update the player's state. This will move the camera object.
      player.update(dt);

      // The camera object's position is now the player's new true position.
      // Store this new position in our tracker.
      playerPositionForCam.copy(camera.position);

      // --- NEW: Additional collision pass for the third-person model ---
      if (cameraMode === "third") {
        const R = 0.4; // Half the width of the 0.8 player cube
        let nx = playerPositionForCam.x;
        let nz = playerPositionForCam.z;

        for (const w of walls) {
          const cx = Math.max(w.min.x, Math.min(nx, w.max.x));
          const cz = Math.max(w.min.z, Math.min(nz, w.max.z));
          const dx = nx - cx;
          const dz = nz - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1e-5;
            const overlap = R - d;
            nx += (dx / d) * overlap;
            nz += (dz / d) * overlap;
          }
        }
        playerPositionForCam.x = nx;
        playerPositionForCam.z = nz;
      }
      // --- END of new collision pass ---

      enemiesCtl.update(dt, true);
      powerupsCtl.update(dt, player, camera);
      weaponsCtl.update(dt, player, camera, enemiesCtl);
      updateKeys(keyMeshes, dt);
      checkKeyCollection();
    }

    // Update the visible player model to match the true player position and orientation
    playerModel.position.copy(playerPositionForCam);
    playerModel.position.y -= playerModel.geometry.parameters.height / 2;

    // --- MODIFIED: Make player model face its movement direction ---
    if (cameraMode === "third") {
      const moveSpeed = player.vel.length();
      // Only update rotation if moving to prevent snapping back to a default angle
      if (moveSpeed > 0.01) {
        // player.vel is a Vector2 where .x is world X and .y is world Z
        const angle = Math.atan2(player.vel.x, player.vel.y);
        const targetQuaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, angle, 0)
        );
        // Slerp for smooth rotation towards the target
        playerModel.quaternion.slerp(targetQuaternion, 15 * dt);
      }
    } else {
      // In first person, it's invisible, but keep it aligned with the camera just in case
      playerModel.rotation.y = look.yaw;
    }

    // Camera mode update - AFTER player logic has determined the new position
    if (cameraMode === "third" && thirdPersonCam) {
      playerModel.visible = true;
      // The third-person camera will read from playerPositionForCam and update the actual camera for rendering.
      thirdPersonCam.update(look.yaw, walls);
    } else {
      // In first-person mode, the camera is the player's view.
      playerModel.visible = false;
      // Its position must match the final, collision-corrected player position.
      camera.position.copy(playerPositionForCam);
    }

    // Door logic
    if (
      !doorOpen &&
      player.hasAllKeys(NUM_KEYS) &&
      Math.abs(camera.position.x - door.position.x) < DOOR_W / 2 &&
      Math.abs(camera.position.z - door.position.z) < MAZE.CELL / 2
    ) {
      doorOpen = true;
    }
    if (doorOpen && door.position.y < MAZE.WALL_H + DOOR_H / 2) {
      doorAnimY += dt * MAZE.WALL_H * 2;
      door.position.y = Math.min(doorAnimY, MAZE.WALL_H + DOOR_H / 2);
    }

    // Win logic
    if (
      !won &&
      doorOpen &&
      Math.abs(camera.position.x - door.position.x) < DOOR_W / 2 &&
      Math.abs(camera.position.z - door.position.z) < MAZE.CELL / 2
    ) {
      try {
        audio.play("level_win", { volume: 0.9 });
      } catch (e) {
        console.error("Failed to play level_win sound:", e);
      }
      won = true;
      hud.showWin();
    }

    // Glow pulse
    door.material.emissiveIntensity = 0.4 + 0.2 * Math.sin(now * 0.003);

    minimap.draw();
    cameraShake.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Start
startGame();