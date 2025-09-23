// src/maze.js
import * as THREE from "three";
import { MAZE } from "./constants.js";
import { gridToWorld } from "./utils.js";

export function generateMaze() {
  const maze = Array.from({ length: MAZE.H }, () => Array(MAZE.W).fill(0));

  function carve(x, y) {
    maze[y][x] = 1;
    const dirs = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
      if (
        ny > 0 &&
        ny < MAZE.H - 1 &&
        nx > 0 &&
        nx < MAZE.W - 1 &&
        maze[ny][nx] === 0
      ) {
        maze[y + dy / 2][x + dx / 2] = 1;
        carve(nx, ny);
      }
    }
  }

  carve(1, 1);
  maze[1][1] = 1;
  maze[MAZE.H - 2][MAZE.W - 2] = 1;
  return maze;
}

export function buildWalls(scene, maze) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a3a4d,
    roughness: 0.6,
    metalness: 0.05,
  });
  const geo = new THREE.BoxGeometry(MAZE.CELL, MAZE.WALL_H, MAZE.CELL);
  const walls = [];
  const group = new THREE.Group();

  for (let y = 0; y < MAZE.H; y++) {
    for (let x = 0; x < MAZE.W; x++) {
      if (maze[y][x] === 0) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        const w = gridToWorld(x, y);
        mesh.position.set(w.x, MAZE.WALL_H / 2, w.z);
        group.add(mesh);
        const half = MAZE.CELL / 2;
        walls.push({
          min: { x: w.x - half, z: w.z - half },
          max: { x: w.x + half, z: w.z + half },
        });
      }
    }
  }

  scene.add(group);
  return { wallGroup: group, walls };
}
