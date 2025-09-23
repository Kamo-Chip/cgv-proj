// src/main.js
import * as THREE from "three";
import { createScene } from "./scene.js";
import { createLookControls } from "./controls.js";
import { createHUD } from "./ui.js";
import { generateMaze, buildWalls } from "./maze.js";
import { Player } from "./player.js";
import { createMinimap } from "./minimap.js";
import { initEnemies } from "./enemies.js";
import { initPowerups } from "./powerups.js";
import { gridToWorld } from "./utils.js";
import { Gun } from "./gun.js";


const { scene, renderer, camera } = createScene();
const hud = createHUD();
const { look, lockPointer } = createLookControls(renderer, camera);

// Maze + walls
const maze = generateMaze();
const { wallGroup, walls } = buildWalls(scene, maze);

// Goal
const goal = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.9, 0.9),
  new THREE.MeshStandardMaterial({
    color: 0x46ff7a,
    emissive: 0x1bff66,
    emissiveIntensity: 0.35,
  })
);
goal.castShadow = true;
{
  const g = gridToWorld(maze[0].length - 2, maze.length - 2);
  goal.position.set(g.x, 0.45, g.z);
}
scene.add(goal);

// Player
const player = new Player(camera, walls, look, hud);
player.setHealth(100);
player.resetToStart(1, 1, goal.position);

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

let currentGun = null; // no gun initially

function onGunPickup(info) {
  // create a gun and equip immediately
  if (currentGun) {
    // you already have a gun — we can ignore or replace; here we replace
    currentGun.dispose();
    currentGun = null;
  }

  currentGun = new Gun({
    scene,
    camera,
    wallGroup,      // from buildWalls returned value - ensure access
    walls,          // walls array
    enemies: enemiesCtl.enemies,
    hud,
  });

  // Place a little "pickup gone" effect or sound here if you want
  // HUD already shows ammo via updateAmmo when creating the Gun
}


// Powerups
const powerupsCtl = initPowerups(scene, maze,onGunPickup);


// Minimap
const minimap = createMinimap(
  maze,
  goal,
  enemiesCtl.enemies,
  powerupsCtl.powerups,
  camera,
  look
);

// Reset flow
function resetGame() {
  won = false;
  lost = false;
  hud.hideWin();
  hud.hideLose();
  player.setHealth(100);
  player.resetToStart(1, 1, goal.position);
  enemiesCtl.reset();
   if (currentGun) {
    currentGun.dispose();
    currentGun = null;
    if (hud && typeof hud.updateAmmo === "function") hud.updateAmmo(null, null);
  }
  powerupsCtl.reset(player);

  if (document.pointerLockElement !== renderer.domElement) hud.showStart(true);
}

// Pointer lock & overlays
hud.playBtn.addEventListener("click", () => {
  hud.showStart(false);
  lockPointer();
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

  if (currentGun) {
    currentGun.fire();
  } else {
    enemiesCtl.performAttack(wallGroup);
  }
});


// Start
resetGame();

// Animate
let last = performance.now();
function tick(now = performance.now()) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

if (document.pointerLockElement === renderer.domElement && !won && !lost) {
  player.update(dt);
  enemiesCtl.update(dt, true);
  powerupsCtl.update(dt, player, camera);

  if (currentGun) {
    currentGun.update(dt);
    // if gun is empty and not reloading, drop it (return to previous weapon)
    if (currentGun.ammo <= 0 && !currentGun.reloading) {
      // dispose and null it so player goes back to default attack
      currentGun.dispose();
      currentGun = null;
      if (hud && typeof hud.updateAmmo === "function") hud.updateAmmo(null, null);
    }
  }
}


  if (!won && camera.position.distanceTo(goal.position) < 0.7) {
    won = true;
    hud.showWin();
  }

  // glow pulse
  goal.material.emissiveIntensity = 0.4 + 0.2 * Math.sin(now * 0.003);

  minimap.draw();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
