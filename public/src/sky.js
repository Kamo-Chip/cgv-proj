import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const DEFAULT_SKY_URL =
  "./models/items/billions_stars_skybox_hdri_panorama (1).glb";
const DEFAULT_BIRDS_URL = "./models/items/birds.glb";

export async function loadSky(scene, options = {}) {
  const {
    url = DEFAULT_SKY_URL,
    targetRadius = 180,
    followCamera = true,
    birdsUrl = DEFAULT_BIRDS_URL,
    birdOrbitRadius = 40,
    birdHeight = 25,
    birdSpan = 12,
    birdSpeed = 0.25,
  } = options;

  const loader = new GLTFLoader();
  const [gltf, birdsGltf] = await Promise.all([
    loader.loadAsync(url),
    birdsUrl ? loader.loadAsync(birdsUrl).catch((err) => {
      console.warn("Failed to load birds GLB:", err);
      return null;
    }) : Promise.resolve(null),
  ]);
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) throw new Error("Sky GLB missing scene root");

  const pivot = new THREE.Group();
  pivot.name = "SkyPivot";
  pivot.add(root);

  let birdsPivot = null;
  let birdsState = null;

  const bbox = new THREE.Box3().setFromObject(root);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  root.position.sub(center);
  root.updateMatrixWorld(true);

  const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
  const uniformScale = targetRadius / maxDim;
  root.scale.setScalar(uniformScale);
  root.updateMatrixWorld(true);

  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    materials.forEach((mat) => {
      if (!mat) return;
      mat.side = THREE.BackSide;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.fog = false;
      if (mat.map) {
        mat.map.encoding = THREE.sRGBEncoding;
        mat.map.needsUpdate = true;
      }
      if (mat.emissive) {
        mat.emissiveIntensity = mat.emissiveIntensity || 1;
      }
    });
  });

  pivot.updateMatrixWorld(true);
  scene.add(pivot);

  if (birdsGltf && birdsGltf.scene) {
    const birdsRoot = birdsGltf.scene.clone(true);
    birdsPivot = new THREE.Group();
    birdsPivot.name = "SkyBirdsPivot";
    birdsPivot.position.y = birdHeight;

    const birdBox = new THREE.Box3().setFromObject(birdsRoot);
    const birdSize = birdBox.getSize(new THREE.Vector3());
    const birdCenter = birdBox.getCenter(new THREE.Vector3());
    birdsRoot.position.sub(birdCenter);
    birdsRoot.updateMatrixWorld(true);

    const maxBirdDim = Math.max(birdSize.x, birdSize.y, birdSize.z, 1e-3);
    const birdScale = birdSpan / maxBirdDim;
    birdsRoot.scale.setScalar(birdScale);
    birdsRoot.updateMatrixWorld(true);

    birdsRoot.position.x = birdOrbitRadius;

    birdsRoot.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const mats = Array.isArray(node.material)
        ? node.material
        : [node.material];
      mats.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = false;
        if (mat.map) {
          mat.map.encoding = THREE.sRGBEncoding;
          mat.map.needsUpdate = true;
        }
      });
    });

    birdsPivot.add(birdsRoot);
    pivot.add(birdsPivot);
    birdsState = {
      angle: 0,
      pivot: birdsPivot,
      speed: birdSpeed,
    };
  }

  return {
    group: pivot,
    followCamera,
    update(position, dt = 0) {
      if (birdsState && birdsState.pivot) {
        birdsState.angle = (birdsState.angle + birdsState.speed * dt) % (Math.PI * 2);
        birdsState.pivot.rotation.y = birdsState.angle;
      }
      if (!followCamera || !position) return;
      pivot.position.copy(position);
    },
  };
}
