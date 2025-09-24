// src/main.js
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createLookControls } from './controls.js';
import { createHUD } from './ui.js';
import { generateMaze, buildWalls, carveExitOnEdge } from './maze.js';
import { Player } from './player.js';
import { createMinimap } from './minimap.js';
import { initEnemies } from './enemies.js';
import { initPowerups } from './powerups.js';
import { createDoor } from './door.js';
import { gridToWorld } from './utils.js';
import { MAZE, WORLD } from './constants.js';
import { initKeycards } from './keycards.js';
import { KEYS } from './constants.js';
import { worldToGrid } from './utils.js';
import { initLightsaber } from './lightsaber.js';
import { WEAPON } from './constants.js';



const { scene, renderer, camera } = createScene();
const hud = createHUD();
const { look, lockPointer } = createLookControls(renderer, camera);

// Maze + walls
const maze = generateMaze();
const exitInfo = carveExitOnEdge(maze);           // <-- NEW: open border cell for exit
const { wallGroup, walls } = buildWalls(scene, maze);

// Door at the exit
const door = createDoor(exitInfo.edge);
door.group.position.set(exitInfo.world.x, 0, exitInfo.world.z);
const DOOR_REACH_RADIUS = 1.0;
const doorGrid = worldToGrid(door.group.position.x, door.group.position.z);

//init keycards (exclude start + door cell)
const keycardsCt1 = initKeycards(scene, maze, {
  excludeCells: [ `${doorGrid.gx},${doorGrid.gy}`],
});

// Nudge the door slightly outward so it sits flush with the outer face
door.group.position.x += exitInfo.normal.x * (MAZE.CELL * 0.5 - 0.001);
door.group.position.z += exitInfo.normal.z * (MAZE.CELL * 0.5 - 0.001);

scene.add(door.group);

// Player
const player = new Player(camera, walls, look, hud);
player.setHealth(100);
player.resetToStart(1, 1, door.group.position); // look roughly toward the door by default

// Enemies + Powerups
let lost = false, won = false;
function onPlayerDamage(dmg) {
  if (lost || won) return;
  player.setHealth(player.health - dmg);
  if (player.health <= 0 && !lost) { lost = true; hud.showLose(); }
}
const enemiesCtl = initEnemies(scene, camera, walls, maze, onPlayerDamage);
const powerupsCtl = initPowerups(scene, maze);
enemiesCtl.setWallGroupRef(wallGroup);
const saberCtl = initLightsaber(scene, maze, {
  excludeCells: [`${doorGrid.gx},${doorGrid.gy}`]
});

// Minimap (show the doorway center as "goal")
const minimap = createMinimap(maze, /* goal */ { position: door.group.position }, enemiesCtl.enemies, powerupsCtl.powerups, camera, look);

// Reset flow
function resetGame() {
  won = false; lost = false;
  hud.hideWin(); hud.hideLose();
  player.setHealth(100);
  player.resetToStart(1, 1, door.group.position);
  enemiesCtl.reset();
  powerupsCtl.reset(player);
  keycardsCt1.reset();
  saberCtl.reset();
  // close the door (reset)
  door.hinge.rotation.y = 0;
  if (document.pointerLockElement !== renderer.domElement) hud.showStart(true);
}

// Controls
hud.playBtn.addEventListener('click', () => { hud.showStart(false); lockPointer(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && !won && !lost) hud.showStart(true);
});
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') resetGame(); });
// addEventListener('mousedown', (e) => {
//   if (e.button !== 0) return;
//   if (document.pointerLockElement !== renderer.domElement) return;
//   enemiesCtl.performAttack(wallGroup);
// });
addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left click
  if (document.pointerLockElement !== renderer.domElement) return;
  if (won || lost) return;

  if (saberCtl.collected) {
    saberCtl.swing();

    // Damage raycast (may be gated by cooldown; that’s fine)
    enemiesCtl.performAttackWith({
      damage: WEAPON.SABER.DAMAGE,
      far: WEAPON.SABER.RANGE,
      cooldown: WEAPON.SABER.COOLDOWN,
    });
  } else {
    enemiesCtl.performAttack(wallGroup);
  }
});

// Start
resetGame();

// Animate
let last = performance.now();
function tick(now = performance.now()) {
  const dt = Math.min((now - last)/1000, 0.05);
  const haveAllKeys = keycardsCt1.collected >= KEYS.REQUIRED;
  last = now;

  if (document.pointerLockElement === renderer.domElement && !won && !lost) {
    player.update(dt);
    enemiesCtl.update(dt, true);
    powerupsCtl.update(dt, player, camera);
    keycardsCt1.update(dt, camera);          // ← NEW
    saberCtl.update(dt, camera); // <- NEW
  }


  if(haveAllKeys){
    const toDoor = camera.position.clone().sub(door.group.position);
    const innerDot = toDoor.x*(-exitInfo.normal.x) + toDoor.z*(-exitInfo.normal.z);
    if(innerDot>-MAZE.CELL && toDoor.length()<MAZE.CELL*1.2){
      door.triggerOpen();
    }
    door.open(dt);
  }

  // Win: cross the doorway plane outward
  if (!won) {
    const distToDoor = camera.position.distanceTo(door.group.position);
    if(distToDoor <= DOOR_REACH_RADIUS){
      won = true;
      hud.showWin();
    }
  }

  minimap.draw();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
