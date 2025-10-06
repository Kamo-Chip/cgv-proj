import * as THREE from "three";
import { createScene } from "./scene.js";
import { createLookControls } from "./controls.js";
import { createHUD } from "./ui.js";
import {
  generateMaze,
  buildWalls,
  generateKeys,
  buildKeys,
  updateKeys,
} from "./maze.js";
import { Player } from "./player.js";
import { createMinimap } from "./minimap.js";
import { initEnemies } from "./enemies.js";
import { initPowerups } from "./powerups.js";
import { initWeapons } from "./weapons.js";
import { gridToWorld } from "./utils.js";
import { MAZE } from "./constants.js";
import { AudioManager, audio } from "./audio.js";

const { scene, renderer, camera } = createScene();
const hud = createHUD();
// Create look controls (pointer lock + look state) — required by Player and other systems
const { look, lockPointer } = createLookControls(renderer, camera);

// Initialize audio (do not resume automatically; wait for user gesture)
// We'll load sounds but not start the AudioContext until user interaction.
(async () => {
  try {
    await audio.loadSounds({
      pistol_fire: "./sounds/pistol_fire.wav",
      pistol_pick: "./sounds/pistol_pick.wav",
      powerup_pick: "./sounds/powerup_pick.wav",
      knife_pick: "./sounds/knife_pick.wav",
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

// Enemies
let lost = false,
  won = false;
function onPlayerDamage(dmg) {
  if (lost || won) return;
  player.setHealth(player.health - dmg);
  if (player.health <= 0 && !lost) {
    lost = true;
    hud.showLose();
  }
}
const enemiesCtl = initEnemies(scene, camera, walls, maze, onPlayerDamage);

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
  look
);

// Keys
const NUM_KEYS = 3; // Adjustable number of keys
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

// Input: R to reset, click to shoot when locked
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") resetGame();
});
addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  // first try weapon fire
  const handled = weaponsCtl.fire(enemiesCtl);
  if (handled) {
    audio.play("pistol_fire", { volume: 0.9 });
  } else enemiesCtl.performAttack(wallGroup);
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
      player.update(dt);
      enemiesCtl.update(dt, true);
      powerupsCtl.update(dt, player, camera);
      weaponsCtl.update(dt, player, camera, enemiesCtl);
      updateKeys(keyMeshes, dt);
      checkKeyCollection();
    }

    // Door logic
    // Only open door when player is near and has all keys
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

    // Win logic: walk through open door
    if (
      !won &&
      doorOpen &&
      Math.abs(camera.position.x - door.position.x) < DOOR_W / 2 &&
      Math.abs(camera.position.z - door.position.z) < MAZE.CELL / 2
    ) {
      won = true;
      hud.showWin();
    }

    // glow pulse
    door.material.emissiveIntensity = 0.4 + 0.2 * Math.sin(now * 0.003);

    minimap.draw();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Start
startGame();
