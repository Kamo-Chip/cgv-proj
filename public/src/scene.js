// src/scene.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WORLD } from "./constants.js";

function createRadialTexture(innerColor, outerColor, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(1, outerColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

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
//   scene.add(camera);

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

  const celestialGroup = new THREE.Group();
  celestialGroup.name = "CelestialGroup";
  scene.add(celestialGroup);

  const loader = new GLTFLoader();
  const skyboxPath = encodeURI(
    "./models/items/billions_stars_skybox_hdri_panorama (1).glb"
  );
  loader.load(
    skyboxPath,
    (gltf) => {
      try {
        const sky = gltf.scene;
        if (!sky) return;
        sky.name = "SkyDome";

        const bbox = new THREE.Box3().setFromObject(sky);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 400;
        if (maxDim > 0) {
          const s = targetSize / maxDim;
          sky.scale.setScalar(s);
        } else {
          sky.scale.setScalar(100);
        }

        const center = bbox.getCenter(new THREE.Vector3());
        sky.position.sub(center);

        sky.traverse((child) => {
          if (child.isMesh) {
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            for (let i = 0; i < materials.length; i++) {
              const mat = materials[i];
              if (!mat) continue;
              const basicMat = new THREE.MeshBasicMaterial({
                map: mat.map ?? null,
                color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
                side: THREE.BackSide,
                fog: false,
                depthWrite: false,
                toneMapped: false,
                transparent: mat.transparent ?? false,
                opacity: mat.opacity ?? 1,
              });
              if (Array.isArray(child.material)) {
                child.material[i] = basicMat;
              } else {
                child.material = basicMat;
              }
            }
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        celestialGroup.add(sky);
      } catch (err) {
        console.warn("Failed to process skybox glb", err);
      }
    },
    undefined,
    (err) => console.warn("Skybox load failed", err)
  );

  const starTexture = createRadialTexture(
    "rgba(255,255,255,0.95)",
    "rgba(255,255,255,0)"
  );
  const starCount = 1800;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const radius = 220 + Math.random() * 160;
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sinPhi = Math.sin(phi);
    starPositions[i * 3] = radius * sinPhi * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.cos(phi);
    starPositions[i * 3 + 2] = radius * sinPhi * Math.sin(theta);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    map: starTexture,
    color: 0xffffff,
    size: 1.6,
    sizeAttenuation: true,
    transparent: true,
    alphaTest: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    opacity: 0.9,
  });
  starMaterial.toneMapped = false;
  const starField = new THREE.Points(starGeometry, starMaterial);
  starField.name = "StarField";
  celestialGroup.add(starField);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(14, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0xfaf6d1,
      emissive: 0xece6bb,
      emissiveIntensity: 2,
      roughness: 0.25,
      metalness: 0,
      fog: false,
    })
  );
  moon.name = "Moon";
  moon.position.set(-140, 160, -240);
  moon.castShadow = false;
  moon.receiveShadow = false;
  moon.material.toneMapped = false;
  celestialGroup.add(moon);

  const moonGlowTexture = createRadialTexture(
    "rgba(255,250,226,0.9)",
    "rgba(255,250,226,0)"
  );
  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: moonGlowTexture,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  moonGlow.name = "MoonGlow";
  moonGlow.scale.set(110, 110, 1);
  moonGlow.position.copy(moon.position);
  moonGlow.material.toneMapped = false;
  celestialGroup.add(moonGlow);

  const moonLight = new THREE.PointLight(0xf7f0c4, 0.35, 400, 2.2);
  moonLight.name = "MoonLight";
  moonLight.position.copy(moon.position);
  celestialGroup.add(moonLight);

  // Resize
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, renderer, camera };
}

// Add after createScene function, before export
export function createCameraShake(camera) {
  let shakeIntensity = 0;
  let shakeDecay = 5; // how fast shake fades
  const originalPosition = new THREE.Vector3();
  
  function trigger(intensity = 0.15, decay = 5) {
    shakeIntensity = intensity;
    shakeDecay = decay;
  }
  
  function update(dt) {
    if (shakeIntensity <= 0.001) {
      shakeIntensity = 0;
      return;
    }
    
    // Apply random offset based on intensity
    const offsetX = (Math.random() - 0.5) * shakeIntensity;
    const offsetY = (Math.random() - 0.5) * shakeIntensity;
    const offsetZ = (Math.random() - 0.5) * shakeIntensity;
    
    // Store original position, apply shake, will be reset next frame
    originalPosition.copy(camera.position);
    camera.position.add(new THREE.Vector3(offsetX, offsetY, offsetZ));
    
    // Decay shake over time
    shakeIntensity = Math.max(0, shakeIntensity - shakeDecay * dt);
  }
  
  return { trigger, update };
}