// src/scene.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WORLD, MAZE } from "./constants.js";

// Modify the createSkybox function to accept custom URLs
function createSkybox(scene, skyboxUrls = null) {
  const loader = new THREE.CubeTextureLoader();
  
  // Default skybox if none provided
  const defaultSkybox = [
    './skybox/space_ft.png',
    './skybox/space_bk.png',
    './skybox/space_up.png',
    './skybox/space_dn.png',
    './skybox/space_rt.png',
    './skybox/space_lf.png'
  ];

  const urls = skyboxUrls || defaultSkybox;

  // Set a fallback color while loading
  scene.background = new THREE.Color(WORLD.BG_COLOR);

  const skyboxTexture = loader.load(
    urls,
    (texture) => {
      texture.encoding = THREE.sRGBEncoding; // ADD THIS LINE
      // Success callback - texture loaded
      scene.background = texture;
      console.log('Skybox loaded successfully');
    },
    undefined,
    (error) => {
      // Error callback
      console.error('Failed to load skybox:', error);
      console.log('Keeping fallback solid color background');
    }
  );
  
  return skyboxTexture;
}

export function createScene() {
  const scene = new THREE.Scene();

   // Add this line to create the skybox
  createSkybox(scene);

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

  // Ground floor using GLB asset
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const FLOOR_TEXTURE_URL = new URL(
    "../models/items/3d-geometric-abstract-background.jpg",
    import.meta.url
  ).href;
  const baseFloorTexture = textureLoader.load(FLOOR_TEXTURE_URL);
  baseFloorTexture.wrapS = THREE.RepeatWrapping;
  baseFloorTexture.wrapT = THREE.RepeatWrapping;
  baseFloorTexture.anisotropy = 8;
  baseFloorTexture.encoding = THREE.sRGBEncoding;
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
            const instancedTexture = baseFloorTexture.clone();
            instancedTexture.wrapS = THREE.RepeatWrapping;
            instancedTexture.wrapT = THREE.RepeatWrapping;
            instancedTexture.repeat.set(2.4, 2.4);
            instancedTexture.needsUpdate = true;
            floorMaterial.map = instancedTexture;
            floorMaterial.needsUpdate = true;
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
            // Fallback: just use the model as-is, scaled up with the local texture applied
            floorModel.position.set(0, 0, 0);
            const scale = mazeSize / Math.max(size.x, size.z);
            floorModel.scale.setScalar(scale);
            const fallbackTexture = baseFloorTexture.clone();
            fallbackTexture.wrapS = THREE.RepeatWrapping;
            fallbackTexture.wrapT = THREE.RepeatWrapping;
            fallbackTexture.repeat.set(tilesX * 0.6, tilesZ * 0.6);
            fallbackTexture.needsUpdate = true;
            floorModel.traverse((child) => {
              if (child.isMesh) {
                child.receiveShadow = true;
                child.castShadow = false;
                if (child.material) {
                  child.material.map = fallbackTexture;
                  child.material.needsUpdate = true;
                }
              }
            });
            scene.add(floorModel);
          }
    },
    undefined,
    (error) => {
          new THREE.MeshStandardMaterial({
            color: 0x1b2431,
            roughness: 0.95,
            map: (() => {
              const texture = baseFloorTexture.clone();
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              texture.repeat.set(40, 40);
              texture.needsUpdate = true;
              return texture;
            })(),
          })
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

  // Replace the addStarField function (around line 150)
  const addStarField = () => {
    const starCount = 1400;
    const radiusMin = 160;
    const radiusMax = 220;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const phases = new Float32Array(starCount); // For sparkle animation
    
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radiusMin + Math.random() * (radiusMax - radiusMin);
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      positions[i * 3 + 0] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * cosPhi;
      positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);
      
      // Vary star sizes
      sizes[i] = 1.2 + Math.random() * 2.0;
      // Random phase for sparkle animation
      phases[i] = Math.random() * Math.PI * 2;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    
    // Custom shader material for sparkling stars
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        attribute float size;
        attribute float phase;
        varying float vPhase;
        
        void main() {
          vPhase = phase;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        varying float vPhase;
        
        void main() {
          // Circular point shape
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          
          // Sparkle effect: varies between 0.6 and 1.0
          float sparkle = 0.6 + 0.4 * sin(time * 2.0 + vPhase);
          
          // Bright white color
          vec3 color = vec3(1.0, 1.0, 1.0);
          
          // Soft edges
          float alpha = smoothstep(0.5, 0.3, dist) * sparkle;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -5;
    stars.frustumCulled = false;
    
    // Store reference for animation
    stars.userData.material = material;
    
    scene.add(stars);
    return stars;
  };

  // Replace the addMoon function (around line 185)
  const addMoon = () => {
    const moonGroup = new THREE.Group();
    
    // Create moon with high detail geometry for craters
    const moonGeometry = new THREE.SphereGeometry(20, 128, 128);
    
    // Procedurally generate craters by displacing vertices
    const positions = moonGeometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    // Seeded random for consistent crater placement
    const craters = [];
    const numCraters = 200; // Increased number of craters
    for (let i = 0; i < numCraters; i++) {
      craters.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: (Math.random() - 0.5) * 2,
        size: 0.1 + Math.random() * 0.4,
        depth: 0.5 + Math.random() * 1.0 // Deeper craters
      });
    }
    
    // Apply crater displacement to vertices
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const originalLength = vertex.length();
      vertex.normalize();
      
      let displacement = 0;
      
      // Calculate displacement from all craters
      for (const crater of craters) {
        const craterCenter = new THREE.Vector3(crater.x, crater.y, crater.z).normalize();
        const distance = vertex.distanceTo(craterCenter);
        
        if (distance < crater.size) {
          // Smooth crater depression with sharper edges
          const falloff = 1 - (distance / crater.size);
          const craterDepth = Math.pow(falloff, 1.5) * crater.depth * 0.6;
          displacement -= craterDepth;
        }
      }
      
      // Add more pronounced noise for surface roughness
      const noise = (Math.sin(vertex.x * 40) * Math.cos(vertex.y * 40) * Math.sin(vertex.z * 40)) * 0.08;
      displacement += noise;
      
      vertex.multiplyScalar(originalLength + displacement);
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    positions.needsUpdate = true;
    moonGeometry.computeVertexNormals(); // Recompute normals for proper lighting
    
    // Much brighter moon material with higher contrast
    const moonMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      roughness: 0.95,
      metalness: 0.0,
    });
    
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.castShadow = false;
    moon.receiveShadow = false;
    moonGroup.add(moon);
    
    // Initial position for elliptical orbit
    moonGroup.position.set(-70, 115, -55);
    
    // Store orbit parameters
    moonGroup.userData.orbit = {
      a: 80,  // semi-major axis (ellipse width)
      b: 60,  // semi-minor axis (ellipse height)
      centerX: 0,
      centerY: 115,
      centerZ: 0,
      angle: Math.atan2(-55, -70), // Initial angle
      speed: 0.05, // Orbit speed (radians per second)
      tilt: Math.PI / 12 // Slight tilt to orbit plane
    };
    
    // Store rotation parameters
    moonGroup.userData.rotation = {
      speed: 0.02 // Rotation speed on its axis
    };
    
    scene.add(moonGroup);
    
    // Much brighter point light
    const moonLight = new THREE.PointLight(0xffffff, 2.5, 300, 1.2);
    moonLight.position.copy(moonGroup.position);
    scene.add(moonLight);
    
    // Store light reference
    moonGroup.userData.light = moonLight;
    
    return moonGroup;
  };

  // Add this before the return statement in createScene() (around line 240)
  const stars = addStarField();
  const moon = addMoon();

  // Animation function for dynamic skybox
  function updateSkybox(deltaTime) {
    // Animate stars sparkle
    if (stars && stars.userData.material) {
      stars.userData.material.uniforms.time.value += deltaTime;
    }
    
    // Animate moon orbit and rotation
    if (moon && moon.userData.orbit) {
      const orbit = moon.userData.orbit;
      const rot = moon.userData.rotation;
      
      // Update orbit angle
      orbit.angle += orbit.speed * deltaTime;
      
      // Calculate elliptical position
      const x = orbit.centerX + orbit.a * Math.cos(orbit.angle);
      const z = orbit.centerZ + orbit.b * Math.sin(orbit.angle);
      const y = orbit.centerY + orbit.a * 0.15 * Math.sin(orbit.angle * 2); // Slight vertical movement
      
      moon.position.set(x, y, z);
      
      // Rotate moon on its axis
      moon.rotation.y += rot.speed * deltaTime;
      
      // Update light position to follow moon
      if (moon.userData.light) {
        moon.userData.light.position.copy(moon.position);
      }
    }
  }

// Store update function for use in main loop
scene.userData.updateSkybox = updateSkybox;

  // Resize
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, renderer, camera };
}

// Add this new export function to update skybox
export function updateSkybox(scene, skyboxUrls) {
  if (!skyboxUrls || !Array.isArray(skyboxUrls)) {
    console.warn('Invalid skybox URLs provided');
    return;
  }
  
  createSkybox(scene, skyboxUrls);
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