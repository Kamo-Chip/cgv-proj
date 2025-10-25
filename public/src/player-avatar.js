import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MOVE } from "./constants.js";

export const AVATAR_HEIGHT = 0.22;
const DEFAULT_MODEL = new URL(
  "../models/items/AnimationLibrary.glb",
  import.meta.url
).href;

const HAND_BONE_KEYS = [
  "hand.r",
  "hand_r",
  "hand-r",
  "r_hand",
  "rhand",
  "right_hand",
  "right-hand",
  "righthand",
  "mixamorig_righthand",
  "mixamorig:righthand",
  "mixamorigrighthand",
];

const WEAPON_PRESETS = {
  knife: {
    position: [0.022, -0.018, 0.039],
    rotation: [Math.PI * 0.15, Math.PI * 0.05, Math.PI * 0.6],
    scale: 0.24,
  },
  pistol: {
    position: [0.01, -0.02, 0.028],
    rotation: [-Math.PI * 0.25, 0, Math.PI * 0.1],
    scale: 0.18,
  },
  default: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
  },
};

function lower(str) {
  return (str ?? "").toLowerCase();
}

function findClip(clips, keywordGroups) {
  for (const group of keywordGroups) {
    const keys = (Array.isArray(group) ? group : [group]).map(lower);
    const clip = clips.find((c) => keys.some((k) => lower(c.name).includes(k)));
    if (clip) return clip;
  }
  return null;
}

function findClips(clips, keywordGroups) {
  const results = [];
  for (const group of keywordGroups) {
    const keys = (Array.isArray(group) ? group : [group]).map(lower);
    const matches = clips.filter((c) => keys.some((k) => lower(c.name).includes(k)));
    for (const clip of matches) {
      if (!results.includes(clip)) results.push(clip);
    }
  }
  return results;
}

function ensureAction(mixer, clip, cache) {
  if (!clip) return null;
  if (!cache.has(clip)) cache.set(clip, mixer.clipAction(clip));
  return cache.get(clip);
}

export function createPlayerAvatar({ modelUrl = DEFAULT_MODEL } = {}) {
  const root = new THREE.Group();
  root.name = "PlayerAvatarRoot";
  root.userData.height = AVATAR_HEIGHT;
  root.userData.ready = false;
  root.userData.animate = () => {};

  const loader = new GLTFLoader();
  loader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;
      if (!model) {
        console.error("Player avatar GLB missing scene");
        return;
      }

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material = child.material.clone();
            child.material.needsUpdate = true;
          }
        }
      });

      const originalBox = new THREE.Box3().setFromObject(model);
      const originalSize = new THREE.Vector3();
      originalBox.getSize(originalSize);
      if (originalSize.y > 0) {
        const scale = AVATAR_HEIGHT / originalSize.y;
        model.scale.setScalar(scale);
      }

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);
      model.position.sub(center);
      root.add(model);

      const mixer = new THREE.AnimationMixer(model);
      const clips = gltf.animations || [];
      const actionCache = new Map();
      const activeOneShots = new Set();
      const heldWeapons = new Map();
      let isDead = false;

      let handBone = null;
      model.traverse((child) => {
        if (!handBone && child.isBone) {
          const name = lower(child.name);
          if (HAND_BONE_KEYS.some((key) => name.includes(key))) handBone = child;
        }
      });

      const handAnchor = new THREE.Group();
      handAnchor.name = "AvatarHandAnchor";
      (handBone || model).add(handAnchor);
      handAnchor.position.set(0, 0, 0);
      handAnchor.rotation.set(0, 0, 0);

      const locomotion = {
        idle: findClip(clips, [["idle_loop"], ["idle"], ["breath"], ["relax"]]) || clips[0] || null,
        walk: findClip(clips, [["walk_loop"], ["walk_fwd"], ["walk"], ["locomotion"]]),
        jog: findClip(clips, [["jog_fwd"], ["jog"]]),
        run: findClip(clips, [["sprint_loop"], ["run_fwd"], ["run"], ["sprint"]]),
        jumpStart: findClip(clips, [["jump_start"]]),
        jumpLoop: findClip(clips, [["jump_loop"]]),
        jumpLand: findClip(clips, [["jump_land"]]),
      };

      if (locomotion.idle && lower(locomotion.idle.name).includes("crouch")) {
        const standingIdle = clips.find(
          (c) =>
            lower(c.name).includes("idle") &&
            !lower(c.name).includes("crouch") &&
            !lower(c.name).includes("sit")
        );
        if (standingIdle) locomotion.idle = standingIdle;
      }

      if (!locomotion.walk && locomotion.jog) locomotion.walk = locomotion.jog;
      if (!locomotion.run) locomotion.run = locomotion.jog || locomotion.walk;
      if (!locomotion.idle && locomotion.walk) locomotion.idle = locomotion.walk;

      const actionLibrary = {
        shoot: findClips(clips, [["pistol_shoot"], ["shoot"]]),
        reload: findClips(clips, [["reload"], ["pistol_reload"]]),
        aim: findClips(clips, [["aim"], ["pistol_aim"]]),
        punch: findClips(clips, [["punch_cross"], ["punch"], ["melee"]]),
        sword: findClips(clips, [["sword_attack"], ["sword"]]),
        hit: findClips(clips, [["hit"], ["impact"], ["reaction"]]),
        pickup: findClips(clips, [["pickup"], ["interact"]]),
        interact: findClips(clips, [["interact"], ["use"]]),
        push: findClips(clips, [["push"], ["shove"]]),
        jumpStart: locomotion.jumpStart ? [locomotion.jumpStart] : [],
        jumpLand: locomotion.jumpLand ? [locomotion.jumpLand] : [],
        death: findClips(clips, [["death01"], ["death"]]),
      };

      let currentBaseClip =
        locomotion.idle || locomotion.walk || locomotion.run || clips[0] || null;
      let currentBaseAction = null;
      const baseWeight = { value: 1, target: 1 };

      function playBase(clip, fade = 0.25) {
        if (isDead) return;
        if (!clip) return;
        if (clip === currentBaseClip && currentBaseAction) return;
        const next = ensureAction(mixer, clip, actionCache);
        if (!next) return;
        next.enabled = true;
        next.reset();
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = false;
        next.fadeIn(fade).play();
        if (currentBaseAction && currentBaseAction !== next) currentBaseAction.fadeOut(fade);
        currentBaseClip = clip;
        currentBaseAction = next;
        currentBaseAction.setEffectiveWeight(baseWeight.value);
      }

      if (currentBaseClip) playBase(currentBaseClip, 0.001);

      mixer.addEventListener("finished", (event) => {
        if (!activeOneShots.has(event.action)) return;
        const linger = event.action.userData?.linger;
        if (!linger) {
          activeOneShots.delete(event.action);
          event.action.fadeOut(0.12);
          setTimeout(() => event.action.stop(), 150);
          if (activeOneShots.size === 0 && !isDead) baseWeight.target = 1;
        } else if (!isDead) {
          baseWeight.target = 1;
        }
      });

      function randomClip(list) {
        if (!list || list.length === 0) return null;
        return list[Math.floor(Math.random() * list.length)];
      }

      function playOneShot(list, { fade = 0.1, weight = 0.45, linger = false } = {}) {
        const clip = Array.isArray(list) ? randomClip(list) : list;
        if (!clip) return false;
        const action = ensureAction(mixer, clip, actionCache);
        if (!action) return false;
        action.enabled = true;
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.fadeIn(fade).play();
        action.userData = action.userData || {};
        action.userData.linger = linger;
        baseWeight.target = Math.min(baseWeight.target, weight);
        activeOneShots.add(action);
        return true;
      }

      const triggerHandlers = {
        shoot: () => playOneShot(actionLibrary.shoot, { weight: 0.35 }),
        reload: () => playOneShot(actionLibrary.reload, { weight: 0.35 }),
        aim: () => playOneShot(actionLibrary.aim, { weight: 0.45 }),
        punch: () => playOneShot(actionLibrary.punch, { weight: 0.35 }),
        sword: () => playOneShot(actionLibrary.sword, { weight: 0.35 }),
        hit: () => playOneShot(actionLibrary.hit, { weight: 0.3 }),
        pickup: () => playOneShot(actionLibrary.pickup, { weight: 0.5 }),
        interact: () => playOneShot(actionLibrary.interact, { weight: 0.5 }),
        push: () => playOneShot(actionLibrary.push, { weight: 0.5 }),
        jumpStart: () => playOneShot(actionLibrary.jumpStart, { weight: 0.4 }),
        jumpHold: () => {
          // Hold the jump loop animation
          const clip = locomotion.jumpLoop;
          if (!clip) return false;
          const action = ensureAction(mixer, clip, actionCache);
          if (!action) return false;
          action.enabled = true;
          action.reset();
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.fadeIn(0.2).play();
          baseWeight.target = 0.3;
          return true;
        },
        jumpLand: () => playOneShot(actionLibrary.jumpLand, { weight: 0.5 }),
        death: () => {
          if (isDead) return false;
          const played = playOneShot(actionLibrary.death, {
            weight: 0,
            fade: 0.08,
            linger: true,
          });
          if (played) {
            isDead = true;
            baseWeight.target = 0;
            if (currentBaseAction) currentBaseAction.fadeOut(0.12);
          }
          return played;
        },
      };

      const WALK_THRESHOLD = 0.05;
      const SPRINT_THRESHOLD = 0.35;

      function resolveLocomotion(speed, grounded, maxSpeed) {
        if (!grounded && locomotion.jumpLoop) return locomotion.jumpLoop;

        const baseMax = MOVE.MAX_SPEED;
        const currentMax = Math.max(baseMax, maxSpeed ?? baseMax);
        const boostActive = currentMax > baseMax * 1.05;

        if (boostActive && speed > SPRINT_THRESHOLD && locomotion.run) return locomotion.run;
        if (speed > WALK_THRESHOLD && locomotion.walk) return locomotion.walk;
        return locomotion.idle || locomotion.walk || locomotion.run || clips[0] || null;
      }

      function update({ dt = 0, speed = 0, grounded = true, maxSpeed = MOVE.MAX_SPEED } = {}) {
        mixer.update(dt);

        if (!isDead) {
          const desiredBase = resolveLocomotion(speed, grounded, maxSpeed);
          if (desiredBase && desiredBase !== currentBaseClip) playBase(desiredBase);
        }

        const lerp = Math.min(1, dt * 6);
        baseWeight.value += (baseWeight.target - baseWeight.value) * lerp;
        if (currentBaseAction) currentBaseAction.setEffectiveWeight(baseWeight.value);
      }

      root.userData.animate = (contextOrDt, maybeSpeed, maybeGrounded, maybeMaxSpeed) => {
        if (typeof contextOrDt === "object") {
          update(contextOrDt);
        } else {
          update({
            dt: contextOrDt ?? 0,
            speed: maybeSpeed ?? 0,
            grounded: maybeGrounded ?? true,
            maxSpeed: maybeMaxSpeed ?? MOVE.MAX_SPEED,
          });
        }
      };

      root.userData.update = update;

      root.userData.triggerAction = (tag) => {
        if (isDead && tag !== "death") return false;
        const handler = triggerHandlers[tag];
        if (!handler) return false;
        const played = handler();
        if (played) baseWeight.target = Math.min(baseWeight.target, 0.5);
        return played;
      };

      function detachWeapon(type) {
        if (!type) return false;
        const key = String(type).toLowerCase();
        const existing = heldWeapons.get(key);
        if (!existing) return false;
        handAnchor.remove(existing);
        heldWeapons.delete(key);
        return true;
      }

      root.userData.equipWeapon = (type, object) => {
        if (!object || !type) return null;
        const key = String(type).toLowerCase();
        detachWeapon(key);
        const preset = WEAPON_PRESETS[key] || WEAPON_PRESETS.default;
        object.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = child.receiveShadow = true;
          }
        });
        object.position.set(0, 0, 0);
        object.rotation.set(0, 0, 0);
        object.scale.set(1, 1, 1);
        object.position.set(...preset.position);
        object.rotation.set(...preset.rotation);
        if (preset.scale !== undefined) object.scale.multiplyScalar(preset.scale);
        handAnchor.add(object);
        heldWeapons.set(key, object);
        return object;
      };

      root.userData.clearWeapon = (type) => detachWeapon(type);

      root.userData.clearAllWeapons = () => {
        for (const mesh of heldWeapons.values()) handAnchor.remove(mesh);
        heldWeapons.clear();
      };

      root.userData.reset = () => {
        mixer.stopAllAction();
        activeOneShots.clear();
        baseWeight.value = baseWeight.target = 1;
        currentBaseAction = null;
        isDead = false;
        root.userData.clearAllWeapons();
        if (currentBaseClip) playBase(currentBaseClip, 0.001);
      };

      root.userData.ready = true;
      root.userData.mixer = mixer;
      root.userData.clips = clips;
      root.userData.playClip = (name) => {
        const clip = clips.find((c) => c.name === name);
        if (clip) playOneShot(clip, { weight: 0.4 });
      };
      root.userData.isDead = () => isDead;
      root.userData.handAnchor = handAnchor;
    },
    undefined,
    (error) => {
      console.error("Failed to load player avatar model", error);
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, AVATAR_HEIGHT, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x9aa0b5, roughness: 0.7 })
      );
      fallback.castShadow = true;
      fallback.position.y = AVATAR_HEIGHT / 2;
      root.add(fallback);
      root.userData.animate = () => {};
      root.userData.ready = true;
    }
  );

  return root;
}
