import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { gridToWorld } from "./utils.js";
import { MAZE } from "./constants.js";

const DEFAULT_CRATE_URL = "./models/items/modular_sci-_fi_crate.glb";

export async function spawnCrates(scene, maze, count = 5, options = {}) {
  const {
    url = DEFAULT_CRATE_URL,
    targetSize = MAZE.CELL * 0.8,
    elevation = 0.1,
  } = options;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) throw new Error("Crate GLB missing scene root");

  const template = root.clone(true);
  template.updateMatrixWorld(true);

  const bbox = new THREE.Box3().setFromObject(template);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  template.position.sub(center);
  template.updateMatrixWorld(true);

  const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
  const uniformScale = targetSize / maxDim;
  template.scale.setScalar(uniformScale);
  template.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(template);
  const baseY = -scaledBox.min.y + elevation;

  template.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  const walkable = [];
  for (let y = 0; y < MAZE.H; y++) {
    for (let x = 0; x < MAZE.W; x++) {
      if (maze[y][x] === 1) walkable.push({ x, y });
    }
  }

  const group = new THREE.Group();
  group.name = "Crates";

  const used = new Set();
  const rng = () => Math.floor(Math.random() * walkable.length);

  for (let i = 0; i < Math.min(count, walkable.length); i++) {
    let idx = rng();
    let attempts = 0;
    while (used.has(idx) && attempts < 20) {
      idx = rng();
      attempts++;
    }
    used.add(idx);
    const cell = walkable[idx];
    const world = gridToWorld(cell.x, cell.y);

    const crate = template.clone(true);
    crate.position.set(world.x, baseY, world.z);
    crate.rotation.y = Math.random() * Math.PI * 2;
    crate.updateMatrixWorld(true);
    group.add(crate);
  }

  scene.add(group);

  return {
    group,
  };
}
