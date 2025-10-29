// src/scene.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WORLD, MAZE } from "./constants.js";

function setSky(scene) {
  const loader = new THREE.CubeTextureLoader();
  const basePath = "./sky/";
  const urls = [
    basePath + "redeclipse_rt.png", // +X
    basePath + "redeclipse_lf.png", // -X
    basePath + "redeclipse_up.png", // +Y
    basePath + "redeclipse_dn.png", // -Y
    basePath + "redeclipse_ft.png", // +Z
    basePath + "redeclipse_bk.png", // -Z
  ];

  const cube = loader.load(urls, () => {
    cube.colorSpace = THREE.SRGBColorSpace;
    // ↓ kill mipmaps to reduce seam artifacts
    cube.generateMipmaps = false;
    cube.minFilter = THREE.LinearFilter;
    cube.magFilter = THREE.LinearFilter;
    scene.background = cube;

    // For reflections, use a PMREM-filtered version (seam-safe)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromCubemap(cube).texture;
    scene.environment = env;
    // keep cube as background; use env for PBR
  });
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

  // Use your sunset image here
  setSky(scene);


  // Ground floor using GLB asset
  const loader = new GLTFLoader();
  const FLOOR_MODEL_URL = new URL(
    "../models/items/floor_asset_low_poly.glb",
    import.meta.url
  ).href;
  loader.load(
    FLOOR_MODEL_URL,
    (gltf) => {
      const floorModel = gltf.scene;
      
      // Get the bounding box of the original model to determine size
      const box = new THREE.Box3().setFromObject(floorModel);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      // Calculate how many tiles we need to cover the maze area (42x42 units)
      const mazeSize = MAZE.W * MAZE.CELL; // 21 * 2 = 42
      const tilesX = Math.ceil((mazeSize * 1.5) / size.x);
      const tilesZ = Math.ceil((mazeSize * 1.5) / size.z);
      
      // Create instanced mesh for efficiency
      let floorGeometry = null;
      let floorMaterial = null;
      
      floorModel.traverse((child) => {
        if (child.isMesh && !floorGeometry) {
          floorGeometry = child.geometry;
          floorMaterial = child.material;
          if (floorMaterial) {
            floorMaterial.roughness = 0.85;
            floorMaterial.metalness = 0.1;
          }
        }
      });
      
      if (floorGeometry && floorMaterial) {
        const instanceCount = tilesX * tilesZ;
        const instancedMesh = new THREE.InstancedMesh(
          floorGeometry,
          floorMaterial,
          instanceCount
        );
        instancedMesh.receiveShadow = true;
        instancedMesh.castShadow = false;
        
        const matrix = new THREE.Matrix4();
        const offsetX = -(tilesX * size.x) / 2;
        const offsetZ = -(tilesZ * size.z) / 2;
        
        let index = 0;
        for (let x = 0; x < tilesX; x++) {
          for (let z = 0; z < tilesZ; z++) {
            matrix.makeTranslation(
              offsetX + x * size.x + size.x / 2,
              0,
              offsetZ + z * size.z + size.z / 2
            );
            instancedMesh.setMatrixAt(index++, matrix);
          }
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        scene.add(instancedMesh);
      } else {
        // Fallback: just use the model as-is, scaled up
        floorModel.position.set(0, 0, 0);
        const scale = mazeSize / Math.max(size.x, size.z);
        floorModel.scale.setScalar(scale);
        floorModel.traverse((child) => {
          if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow = false;
          }
        });
        // Attempt to load an external floor texture and apply it to the model's material
        const externalFloor = "https://cdn.polyhaven.com/asset_img/primary/worn_asphalt.png?height=760&quality=780";
        try {
          const tLoader = new THREE.TextureLoader();
          tLoader.load(
            externalFloor,
            (tex) => {
              tex.wrapS = THREE.RepeatWrapping;
              tex.wrapT = THREE.RepeatWrapping;
              tex.repeat.set(tilesX * 0.5, tilesZ * 0.5);
              tex.anisotropy = 8;
              tex.encoding = THREE.sRGBEncoding;
              floorModel.traverse((child) => {
                if (child.isMesh && child.material) {
                  child.material.map = tex;
                  child.material.needsUpdate = true;
                }
              });
              scene.add(floorModel);
            },
            undefined,
            (err) => {
              console.warn("Failed to load external floor texture, using model material:", err);
              scene.add(floorModel);
            }
          );
        } catch (e) {
          console.warn("TextureLoader error, using model material:", e);
          scene.add(floorModel);
        }
      }
    },
    undefined,
    (error) => {
      console.error("Error loading floor asset:", error);
      // Fallback to simple plane
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(300, 300),
        new THREE.MeshStandardMaterial({ color: 0x1b2431, roughness: 0.95 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
    }
  );

  const grid = new THREE.GridHelper(300, 150, 0x3b8cff, 0x314055);
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  scene.add(grid);

  const addStarField = () => {
    const starCount = 1400;
    const radiusMin = 160;
    const radiusMax = 220;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radiusMin + Math.random() * (radiusMax - radiusMin);
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      positions[i * 3 + 0] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * cosPhi;
      positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -5;
    stars.frustumCulled = false;
    scene.add(stars);
  };

  const addMoon = () => {
    const moonGroup = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(8, 40, 40),
      new THREE.MeshStandardMaterial({
        color: 0xfdf5ce,
        emissive: 0xfbe4a0,
        emissiveIntensity: 2.2,
        roughness: 0.35,
        metalness: 0,
      })
    );
    moon.castShadow = false;
    moon.receiveShadow = false;
    moonGroup.add(moon);
    moonGroup.position.set(-70, 115, -55);
    scene.add(moonGroup);

    const moonLight = new THREE.PointLight(0xfbe8b4, 0.55, 210, 1.4);
    moonLight.position.copy(moonGroup.position);
    scene.add(moonLight);
  };

  addStarField();
  addMoon();

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