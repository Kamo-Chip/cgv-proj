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
import { gridToWorld, worldToGrid } from './utils.js';
import { MAZE } from './constants.js';
import { initKeycards } from './keycards.js';
import { KEYS } from './constants.js';
import { initLightsaber } from './lightsaber.js';
import { WEAPON } from './constants.js';

const { scene, renderer, camera } = createScene();
const hud = createHUD();
const { look, lockPointer } = createLookControls(renderer, camera);

// Maze + walls
const maze = generateMaze();
const exitInfo = carveExitOnEdge(maze); // { edge, world: {x,z}, normal:{x,z} }
const { wallGroup, walls } = buildWalls(scene, maze);

// Door
const door = createDoor(exitInfo.edge);
door.group.position.set(exitInfo.world.x, 0, exitInfo.world.z);

// Nudge the door outward to sit flush with the border face
door.group.position.x += exitInfo.normal.x * (MAZE.CELL * 0.5 - 0.001);
door.group.position.z += exitInfo.normal.z * (MAZE.CELL * 0.5 - 0.001);
scene.add(door.group);

// Use final door position for exclusions
const doorGrid = worldToGrid(door.group.position.x, door.group.position.z);

// Player
const player = new Player(camera, walls, look, hud);
player.setHealth(100);
player.resetToStart(1, 1, door.group.position);

// Enemies + Powerups + Saber + Keycards
let lost = false, won = false;

function onPlayerDamage(dmg) {
  if (lost || won) return;
  player.setHealth(player.health - dmg);
  if (player.health <= 0 && !lost) { lost = true; hud.showLose(); }
}

const enemiesCtl = initEnemies(scene, camera, walls, maze, onPlayerDamage);
enemiesCtl.setWallGroupRef(wallGroup);

const powerupsCtl = initPowerups(scene, maze);

const keycardsCt1 = initKeycards(scene, maze, {
  excludeCells: [`${doorGrid.gx},${doorGrid.gy}`],
});

const saberCtl = initLightsaber(scene, maze, {
  excludeCells: [`${doorGrid.gx},${doorGrid.gy}`],
});

// Minimap
const minimap = createMinimap(
  maze,
  { position: door.group.position },
  enemiesCtl.enemies,
  powerupsCtl.powerups,
  camera,
  look
);

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
  door.resetClose(); // <— ensure closed state
  if (document.pointerLockElement !== renderer.domElement) hud.showStart(true);
}

// Controls
hud.playBtn.addEventListener('click', () => { hud.showStart(false); lockPointer(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && !won && !lost) hud.showStart(true);
});
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') resetGame(); });

// Mouse: LMB triggers saber swing (if collected) with mid-swing hit timing
addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left click
  if (document.pointerLockElement !== renderer.domElement) return;
  if (won || lost) return;

  if (saberCtl.collected) {
    saberCtl.swing();
    // Hit window roughly mid-swing (adjust 100–150ms to taste)
    setTimeout(() => {
      if (won || lost || !saberCtl.collected) return;
      enemiesCtl.performAttackWith({
        damage: WEAPON.SABER.DAMAGE,
        far: WEAPON.SABER.RANGE,
        cooldown: WEAPON.SABER.COOLDOWN,
      });
    }, 120);
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

  const haveAllKeys = keycardsCt1.collected >= KEYS.REQUIRED;

  if (document.pointerLockElement === renderer.domElement && !won && !lost) {
    player.update(dt);
    enemiesCtl.update(dt, true);
    powerupsCtl.update(dt, player, camera);
    keycardsCt1.update(dt, camera);
    
  }
  saberCtl.update(dt, camera);

  // Door open logic: require keys, then open when player is near the inside
  if (haveAllKeys) {
    const toDoor = camera.position.clone().sub(door.group.position);
    const innerDot = toDoor.x * (-exitInfo.normal.x) + toDoor.z * (-exitInfo.normal.z);
    if (innerDot > -MAZE.CELL && toDoor.length() < MAZE.CELL * 1.2) {
      door.triggerOpen();
    }
    door.open(dt);
  }

  // Win only if the door is open AND player has crossed the plane outward
  if (!won && door.isOpen() && door.isCrossed(camera.position, door.group.position, exitInfo.normal)) {
    won = true;
    hud.showWin();
  }

  minimap.draw();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
