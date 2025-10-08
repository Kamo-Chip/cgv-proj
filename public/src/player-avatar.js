import * as THREE from "three";

export const AVATAR_HEIGHT = 1.8;
const PIXEL_UNIT = AVATAR_HEIGHT / 32;
const DEFAULT_SKIN = "https://minotar.net/skin/D_Luc";

const FACE_ORDER = ["right", "left", "top", "bottom", "front", "back"];

function skinRegion(x, y, w, h) {
  const texSize = 64;
  const u0 = x / texSize;
  const u1 = (x + w) / texSize;
  const v1 = 1 - y / texSize;
  const v0 = 1 - (y + h) / texSize;
  return { u0, u1, v0, v1 };
}

function applyBoxUVs(geometry, map) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < FACE_ORDER.length; i++) {
    const region = map[FACE_ORDER[i]];
    if (!region) continue;
    const offset = i * 8;
    const { u0, u1, v0, v1 } = region;
    uv.array[offset + 0] = u1;
    uv.array[offset + 1] = v0;
    uv.array[offset + 2] = u0;
    uv.array[offset + 3] = v0;
    uv.array[offset + 4] = u1;
    uv.array[offset + 5] = v1;
    uv.array[offset + 6] = u0;
    uv.array[offset + 7] = v1;
  }
  uv.needsUpdate = true;
}

function createBox(size, map, material) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z, 2, 2, 2);
  applyBoxUVs(geometry, map);
  return new THREE.Mesh(geometry, material);
}

const SKIN_MAP = {
  head: {
    size: new THREE.Vector3(8 * PIXEL_UNIT, 8 * PIXEL_UNIT, 8 * PIXEL_UNIT),
    base: {
      front: skinRegion(8, 8, 8, 8),
      back: skinRegion(24, 8, 8, 8),
      right: skinRegion(0, 8, 8, 8),
      left: skinRegion(16, 8, 8, 8),
      top: skinRegion(8, 0, 8, 8),
      bottom: skinRegion(16, 0, 8, 8),
    },
    overlay: {
      front: skinRegion(40, 8, 8, 8),
      back: skinRegion(56, 8, 8, 8),
      right: skinRegion(32, 8, 8, 8),
      left: skinRegion(48, 8, 8, 8),
      top: skinRegion(40, 0, 8, 8),
      bottom: skinRegion(48, 0, 8, 8),
    },
  },
  torso: {
    size: new THREE.Vector3(8 * PIXEL_UNIT, 12 * PIXEL_UNIT, 4 * PIXEL_UNIT),
    base: {
      front: skinRegion(20, 20, 8, 12),
      back: skinRegion(32, 20, 8, 12),
      right: skinRegion(16, 20, 4, 12),
      left: skinRegion(28, 20, 4, 12),
      top: skinRegion(20, 16, 8, 4),
      bottom: skinRegion(28, 16, 8, 4),
    },
    overlay: {
      front: skinRegion(20, 36, 8, 12),
      back: skinRegion(32, 36, 8, 12),
      right: skinRegion(16, 36, 4, 12),
      left: skinRegion(28, 36, 4, 12),
      top: skinRegion(20, 32, 8, 4),
      bottom: skinRegion(28, 32, 8, 4),
    },
  },
  legLeft: {
    size: new THREE.Vector3(4 * PIXEL_UNIT, 12 * PIXEL_UNIT, 4 * PIXEL_UNIT),
    base: {
      front: skinRegion(4, 20, 4, 12),
      back: skinRegion(12, 20, 4, 12),
      right: skinRegion(0, 20, 4, 12),
      left: skinRegion(8, 20, 4, 12),
      top: skinRegion(4, 16, 4, 4),
      bottom: skinRegion(8, 16, 4, 4),
    },
    overlay: {
      front: skinRegion(4, 36, 4, 12),
      back: skinRegion(12, 36, 4, 12),
      right: skinRegion(0, 36, 4, 12),
      left: skinRegion(8, 36, 4, 12),
      top: skinRegion(4, 32, 4, 4),
      bottom: skinRegion(8, 32, 4, 4),
    },
  },
  legRight: {
    size: new THREE.Vector3(4 * PIXEL_UNIT, 12 * PIXEL_UNIT, 4 * PIXEL_UNIT),
    base: {
      front: skinRegion(20, 52, 4, 12),
      back: skinRegion(28, 52, 4, 12),
      right: skinRegion(16, 52, 4, 12),
      left: skinRegion(24, 52, 4, 12),
      top: skinRegion(36, 48, 4, 4),
      bottom: skinRegion(24, 48, 4, 4),
    },
    overlay: {
      front: skinRegion(4, 52, 4, 12),
      back: skinRegion(12, 52, 4, 12),
      right: skinRegion(0, 52, 4, 12),
      left: skinRegion(8, 52, 4, 12),
      top: skinRegion(4, 48, 4, 4),
      bottom: skinRegion(8, 48, 4, 4),
    },
  },
  armRight: {
    size: new THREE.Vector3(4 * PIXEL_UNIT, 12 * PIXEL_UNIT, 4 * PIXEL_UNIT),
    base: {
      front: skinRegion(36, 52, 4, 12),
      back: skinRegion(44, 52, 4, 12),
      right: skinRegion(32, 52, 4, 12),
      left: skinRegion(40, 52, 4, 12),
      top: skinRegion(36, 48, 4, 4),
      bottom: skinRegion(40, 48, 4, 4),
    },
    overlay: {
      front: skinRegion(44, 36, 4, 12),
      back: skinRegion(52, 36, 4, 12),
      right: skinRegion(40, 36, 4, 12),
      left: skinRegion(48, 36, 4, 12),
      top: skinRegion(44, 32, 4, 4),
      bottom: skinRegion(48, 32, 4, 4),
    },
  },
  armLeft: {
    size: new THREE.Vector3(4 * PIXEL_UNIT, 12 * PIXEL_UNIT, 4 * PIXEL_UNIT),
    base: {
      front: skinRegion(44, 20, 4, 12),
      back: skinRegion(52, 20, 4, 12),
      right: skinRegion(40, 20, 4, 12),
      left: skinRegion(48, 20, 4, 12),
      top: skinRegion(44, 16, 4, 4),
      bottom: skinRegion(48, 16, 4, 4),
    },
    overlay: {
      front: skinRegion(52, 52, 4, 12),
      back: skinRegion(60, 52, 4, 12),
      right: skinRegion(48, 52, 4, 12),
      left: skinRegion(56, 52, 4, 12),
      top: skinRegion(52, 48, 4, 4),
      bottom: skinRegion(56, 48, 4, 4),
    },
  },
  handRight: {
    size: new THREE.Vector3(3 * PIXEL_UNIT, 3 * PIXEL_UNIT, 3 * PIXEL_UNIT),
    base: {
      front: skinRegion(44, 20, 4, 4),
      back: skinRegion(52, 20, 4, 4),
      right: skinRegion(40, 20, 4, 4),
      left: skinRegion(48, 20, 4, 4),
      top: skinRegion(44, 16, 4, 4),
      bottom: skinRegion(48, 16, 4, 4),
    },
  },
  handLeft: {
    size: new THREE.Vector3(3 * PIXEL_UNIT, 3 * PIXEL_UNIT, 3 * PIXEL_UNIT),
    base: {
      front: skinRegion(44, 20, 4, 4),
      back: skinRegion(52, 20, 4, 4),
      right: skinRegion(40, 20, 4, 4),
      left: skinRegion(48, 20, 4, 4),
      top: skinRegion(44, 16, 4, 4),
      bottom: skinRegion(48, 16, 4, 4),
    },
  },
};

function buildAvatar(materials) {
  const { baseMaterial, overlayMaterial } = materials;
  const group = new THREE.Group();
  group.name = "PlayerAvatar";

  const allMeshes = [];
  const refs = {};

  const legsHeight = SKIN_MAP.legLeft.size.y;
  const torsoHeight = SKIN_MAP.torso.size.y;
  const torsoWidth = SKIN_MAP.torso.size.x;
  const armWidth = SKIN_MAP.armLeft.size.x;
  const legWidth = SKIN_MAP.legLeft.size.x;
  const handHeight = SKIN_MAP.handLeft.size.y;

  const hipGap = PIXEL_UNIT * 0.5;
  const shoulderGap = PIXEL_UNIT * 0.5;

  function addPart(partKey, options) {
    const part = SKIN_MAP[partKey];
    const baseMesh = createBox(part.size, part.base, baseMaterial);
    baseMesh.castShadow = true;
    allMeshes.push(baseMesh);
    options.container.add(baseMesh);
    baseMesh.position.copy(options.meshOffset ?? new THREE.Vector3());

    if (part.overlay) {
      const overlayMesh = createBox(part.size, part.overlay, overlayMaterial);
      overlayMesh.scale.setScalar(options.overlayScale ?? 1.05);
      overlayMesh.position.copy(baseMesh.position);
      overlayMesh.castShadow = false;
      overlayMesh.name = `${partKey}-overlay`;
      options.container.add(overlayMesh);
      allMeshes.push(overlayMesh);
    }

    return baseMesh;
  }

  const torsoGroup = new THREE.Group();
  torsoGroup.name = "AvatarTorso";
  torsoGroup.position.set(0, legsHeight + torsoHeight / 2, 0);
  addPart("torso", { container: torsoGroup, meshOffset: new THREE.Vector3(0, 0, 0) });
  group.add(torsoGroup);
  refs.torso = torsoGroup;
  const torsoBaseY = torsoGroup.position.y;

  const headPivot = new THREE.Group();
  headPivot.name = "AvatarHead";
  headPivot.position.set(0, legsHeight + torsoHeight, 0);
  const headOffset = new THREE.Vector3(0, SKIN_MAP.head.size.y / 2, 0);
  addPart("head", { container: headPivot, meshOffset: headOffset, overlayScale: 1.06 });
  group.add(headPivot);
  refs.head = headPivot;

  // Mouth (simple mesh for expressive animation)
  const mouthGeometry = new THREE.PlaneGeometry(2 * PIXEL_UNIT, 0.6 * PIXEL_UNIT, 1, 1);
  const mouthMaterial = new THREE.MeshStandardMaterial({
    color: 0xe66,
    emissive: 0x220505,
    roughness: 0.45,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mouthMesh = new THREE.Mesh(mouthGeometry, mouthMaterial);
  mouthMesh.position.set(0, headOffset.y - 2 * PIXEL_UNIT, SKIN_MAP.head.size.z / 2 + PIXEL_UNIT * 0.15);
  mouthMesh.castShadow = false;
  mouthMesh.receiveShadow = false;
  mouthMesh.name = "AvatarMouth";
  refs.mouth = mouthMesh;
  headPivot.add(mouthMesh);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.name = "AvatarLegLeft";
  leftLegPivot.position.set(-(legWidth + hipGap) / 2, legsHeight, 0);
  const legOffset = new THREE.Vector3(0, -SKIN_MAP.legLeft.size.y / 2, 0);
  addPart("legLeft", { container: leftLegPivot, meshOffset: legOffset, overlayScale: 1.02 });
  group.add(leftLegPivot);
  refs.legLeft = leftLegPivot;

  const rightLegPivot = new THREE.Group();
  rightLegPivot.name = "AvatarLegRight";
  rightLegPivot.position.set((legWidth + hipGap) / 2, legsHeight, 0);
  addPart("legRight", { container: rightLegPivot, meshOffset: legOffset, overlayScale: 1.02 });
  group.add(rightLegPivot);
  refs.legRight = rightLegPivot;

  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = "AvatarArmRight";
  rightArmPivot.position.set(
    -(torsoWidth / 2 + armWidth / 2 + shoulderGap),
    legsHeight + torsoHeight,
    0
  );
  const armOffset = new THREE.Vector3(0, -SKIN_MAP.armRight.size.y / 2, 0);
  addPart("armRight", { container: rightArmPivot, meshOffset: armOffset, overlayScale: 1.04 });
  group.add(rightArmPivot);
  refs.armRight = rightArmPivot;

  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = "AvatarArmLeft";
  leftArmPivot.position.set(
    torsoWidth / 2 + armWidth / 2 + shoulderGap,
    legsHeight + torsoHeight,
    0
  );
  addPart("armLeft", { container: leftArmPivot, meshOffset: armOffset, overlayScale: 1.04 });
  group.add(leftArmPivot);
  refs.armLeft = leftArmPivot;

  const rightHandPivot = new THREE.Group();
  rightHandPivot.name = "AvatarHandRight";
  rightHandPivot.position.set(0, -SKIN_MAP.armRight.size.y + handHeight / 2, 0);
  const handOffset = new THREE.Vector3(0, -handHeight / 2, 0);
  addPart("handRight", { container: rightHandPivot, meshOffset: handOffset, overlayScale: 1.02 });
  rightArmPivot.add(rightHandPivot);
  refs.handRight = rightHandPivot;

  const leftHandPivot = new THREE.Group();
  leftHandPivot.name = "AvatarHandLeft";
  leftHandPivot.position.set(0, -SKIN_MAP.armLeft.size.y + handHeight / 2, 0);
  addPart("handLeft", { container: leftHandPivot, meshOffset: handOffset, overlayScale: 1.02 });
  leftArmPivot.add(leftHandPivot);
  refs.handLeft = leftHandPivot;

  const headBasePitch = THREE.MathUtils.degToRad(10);
  const headBaseYaw = THREE.MathUtils.degToRad(20);

  const animate = (time, speed) => {
    const walkIntensity = THREE.MathUtils.clamp(speed * 0.4, 0, 1);
    const cycle = time * 6;
    const swing = 0.6 * walkIntensity;

    refs.armRight.rotation.x = -0.2 + Math.sin(cycle + Math.PI) * swing;
    refs.armLeft.rotation.x = 0.2 + Math.sin(cycle) * swing;

    refs.legRight.rotation.x = Math.sin(cycle + Math.PI) * 0.7 * walkIntensity;
    refs.legLeft.rotation.x = Math.sin(cycle) * 0.7 * walkIntensity;

    refs.handRight.rotation.x = Math.sin(cycle + Math.PI) * 0.35 * walkIntensity;
    refs.handLeft.rotation.x = Math.sin(cycle) * 0.35 * walkIntensity;

    refs.torso.position.y = torsoBaseY + Math.sin(cycle * 0.5) * 0.02 * walkIntensity;

    const idle = Math.sin(time * 0.4) * 0.05;
    refs.head.rotation.y = headBaseYaw + Math.sin(time * 0.6) * 0.18;
    refs.head.rotation.x = headBasePitch + idle + walkIntensity * 0.08;

    const mouthPulse = 1 + Math.max(0, Math.sin(time * 3)) * 0.35 * (0.5 + walkIntensity);
    refs.mouth.scale.y = THREE.MathUtils.lerp(refs.mouth.scale.y, mouthPulse, 0.2);
  };

  return { group, allMeshes, animate };
}

export function createPlayerAvatar({ skinUrl = DEFAULT_SKIN } = {}) {
  const root = new THREE.Group();
  root.name = "PlayerAvatarRoot";
  root.userData.height = AVATAR_HEIGHT;
  root.userData.ready = false;
  root.userData.animate = () => {};

  const loader = new THREE.TextureLoader();
  loader.load(
    skinUrl,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.flipY = false;

      const baseMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.65,
        metalness: 0.1,
        flatShading: false,
      });
      const overlayMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.5,
        metalness: 0.05,
        transparent: true,
        alphaTest: 0.5,
        depthWrite: false,
        flatShading: false,
      });

      const { group, allMeshes, animate } = buildAvatar({ baseMaterial, overlayMaterial });
      allMeshes.forEach((mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      });
      root.add(group);
      root.userData.animate = animate;
      root.userData.ready = true;
    },
    undefined,
    (error) => {
      console.error("Failed to load player skin", error);
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, AVATAR_HEIGHT, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 })
      );
      fallback.position.y = AVATAR_HEIGHT / 2;
      fallback.castShadow = true;
      root.add(fallback);
      root.userData.animate = () => {};
      root.userData.ready = true;
    }
  );

  return root;
}
