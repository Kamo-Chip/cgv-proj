// src/scene.js
import * as THREE from "three";
import { WORLD } from "./constants.js";

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.BG_COLOR);
  scene.fog = new THREE.Fog(WORLD.BG_COLOR, WORLD.FOG_NEAR, WORLD.FOG_FAR);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  document.getElementById("app").appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    70,
    innerWidth / innerHeight,
    0.1,
    200
  );
  camera.position.set(1, WORLD.PLAYER_BASE_H, 1);

  // Lighting
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x18222e, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(8, 15, 6);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.far = 80;
  scene.add(hemi, dir);

  // Ground + helper grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x1b2431, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(300, 150, 0x3b8cff, 0x314055);
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  scene.add(grid);

  // Resize
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, renderer, camera };
}
