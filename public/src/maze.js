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

export function generateKeys(maze, numKeys) {
  const keys = [];
  let attempts = 0;
  while (keys.length < numKeys && attempts < 1000) {
    const x = Math.floor(Math.random() * (MAZE.W - 2)) + 1;
    const y = Math.floor(Math.random() * (MAZE.H - 2)) + 1;
    if (maze[y][x] === 1 && !keys.some((k) => k.x === x && k.y === y)) {
      keys.push({ x, y });
    }
    attempts++;
  }
  return keys;
}

export function buildKeys(scene, keys) {
  const keyMat = new THREE.MeshStandardMaterial({
    color: 0xffff00, // bright yellow
    metalness: 0.7,
    roughness: 0.15,
    emissive: 0xffff00,
    emissiveIntensity: 0.7,
  });
  const keyGeo = new THREE.BoxGeometry(
    MAZE.CELL * 0.3,
    MAZE.CELL * 0.3,
    MAZE.CELL * 0.3
  );
  const keyMeshes = [];
  for (const key of keys) {
    const w = gridToWorld(key.x, key.y);
    const mesh = new THREE.Mesh(keyGeo, keyMat);
    mesh.position.set(w.x, MAZE.CELL * 0.5, w.z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    keyMeshes.push({ mesh, x: key.x, y: key.y });
  }
  return keyMeshes;
}
