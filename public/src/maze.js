// src/maze.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MAZE } from "./constants.js";
import { gridToWorld } from "./utils.js";

// module-level incremental id to give each spawned key a stable unique id
let _keyInstanceId = 0;

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
    roughness: 0.9,
    metalness: 0.1,
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

// Helper: load a GLTF and return the root scene. Use like:
// const keyModel = await loadKeyModel('/models/my_key.glb');
export async function loadKeyModel(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

// buildKeys now accepts an optional keyModel (a THREE.Object3D or scene) and an options object.
// If keyModel is provided it will be cloned per key. Otherwise a box fallback is used.
export async function buildKeys(
  scene,
  keys,
  keyModel = "./models/items/key_card.glb",
  options = {}
) {
  const { scale = 1 } = options;

  const keyMeshes = [];

  // If a string path was provided, load the GLTF model
  if (typeof keyModel === "string") {
    try {
      keyModel = await loadKeyModel(keyModel);
    } catch (err) {
      console.warn("Failed to load key model:", err);
      keyModel = null;
    }
  }

  if (!keyModel) {
    // fallback to box geometry (original behaviour)
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

    for (const key of keys) {
      const w = gridToWorld(key.x, key.y);
      const mesh = new THREE.Mesh(keyGeo, keyMat);
      mesh.position.set(w.x, MAZE.CELL * 0.5, w.z);
      mesh.castShadow = mesh.receiveShadow = true;

      // assign a stable unique id for this instance and store it on the mesh
      const id = _keyInstanceId++;
      mesh.userData = mesh.userData || {};
      mesh.userData.keyId = id;

      scene.add(mesh);
      keyMeshes.push({ mesh, x: key.x, y: key.y, id });
    }

    return keyMeshes;
  }

  // If a GLTF model was provided, clone it for each key
  for (const key of keys) {
    const w = gridToWorld(key.x, key.y);
    // keyModel should now be an Object3D; clone it for this instance
    const instance = keyModel.clone ? keyModel.clone(true) : keyModel;

    // apply optional uniform scale
    if (scale !== 1) instance.scale.multiplyScalar(scale);

    // position the model at cell center (adjust Y if model origin differs)
    instance.position.set(w.x, 0.5, w.z);

    // ensure shadows for any meshes inside the model
    instance.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });

    // assign a stable unique id for this instance and store it on the root object
    const id = _keyInstanceId++;
    instance.userData = instance.userData || {};
    instance.userData.keyId = id;

    scene.add(instance);
    keyMeshes.push({ mesh: instance, x: key.x, y: key.y, id });
  }

  return keyMeshes;
}

// Animate keys: rotate and bob up/down. Call this each frame from main.tick(dt).
export function updateKeys(keyMeshes, dt) {
  if (!keyMeshes || !keyMeshes.length) return;
  const now = performance.now();
  for (const k of keyMeshes) {
    const m = k.mesh;
    if (!m) continue;
    // rotate around vertical axis
    // subtle bob using grid-based phase so they are not synchronized
    const baseY = MAZE.CELL * 0.25;
    const phase = (k.x || 0) * 13.3 + (k.y || 0) * 7.7;
    m.position.y = baseY + Math.sin(now * 0.003 + phase) * 0.05;
  }
}