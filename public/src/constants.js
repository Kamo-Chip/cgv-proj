export const WORLD = {
  BG_COLOR: 0x0b0d12,
  FOG_NEAR: 25,
  FOG_FAR: 120,
  PLAYER_BASE_H: 0.8,
  PLAYER_RADIUS: 0.35,
};

export const MAZE = {
  W: 21,
  H: 21,
  CELL: 2,
  WALL_H: 6.4,
};

export const ENEMY_STATE = {
  PATROL: "patrol",
  CHASE: "chase",
  ATTACK: "attack",
};

export const MOVE = {
  ACCEL: 30,
  MAX_SPEED: 20,
  DAMPING: 12,
  BASE_GRAVITY: -20,
  BASE_JUMP_V: 6,
};

export const ENEMY = {
  SPEED: 1.6,
  RADIUS: 0.49,
  DMG_PER_SEC: 1,
  REPLAN_DT: 0.1,
  TARGET_COUNT: 6,
  SPAWN_MIN_DIST: MAZE.CELL * 6,
  SEPARATION_DIST: MAZE.CELL * 2.5,
  MAX_SPAWN_TRIES: 300,
  SEPARATION_ITERATIONS: 2,
  PUSH_FACTOR: 1.0,
  PATHFIND_RADIUS: MAZE.CELL * 10,
  WANDER_SPEED: 0.8,
  MIN_PLAYER_DIST: 0.34,
  ATTACK_RADIUS: 0.45,
  RAM_TRIGGER_DIST: 0.75,
  RAM_WINDUP_TIME: 0.32,
  RAM_CHARGE_TIME: 0.24,
  RAM_BACKOFF_TIME: 0.18,
  RAM_COOLDOWN_TIME: 0.4,
  RAM_CHARGE_SPEED: 3.0,
  RAM_BACKOFF_SPEED: 1.4,
};

export const COMBAT = {
  HIT_DAMAGE: 10,
  FIRE_COOLDOWN: 0.25,
  RAYCAST_MAX: 5,
};

export const POWERUP = {
  COUNT: 10,
  DURATION: 100,
  JUMP_MULT: 2,
  GRAVITY_MULT: 0.3,
  PICKUP_RADIUS: 0.6,
  COMPASS_DURATION: 10,
  COMPASS_WEIGHT: 3,
};

export const WEAPON = {
  COUNT: 5,
  PICKUP_RADIUS: 1.0,
  SPAWN_MIN_DIST: MAZE.CELL * 4,
  SEPARATION_DIST: MAZE.CELL * 2.2,
};

export const MINIMAP = {
  TILE: 8,
  PAD: 2,
  RADIUS_TILES: 5,
};

// Level presets - lightweight overrides for per-level tuning.
// Each level can override any subset of the exported constant objects.
export const LEVELS = [
  {
    // Level 1: Easy - few enemies, more powerups
    name: "Level 1",
    ENEMY: { TARGET_COUNT: 5, SPEED: 1.4 },
    POWERUP: { COUNT: 10 },
    MOVE: { MAX_SPEED: 18 },
    MAZE: { W: 11, H: 11 },
    skybox: [
      "./skybox/corona_ft.png",
      "./skybox/corona_bk.png",
      "./skybox/corona_up.png",
      "./skybox/corona_dn.png",
      "./skybox/corona_rt.png",
      "./skybox/corona_lf.png",
    ],
  },
  {
    // Level 2: Medium
    name: "Level 2",
    ENEMY: { TARGET_COUNT: 10, SPEED: 1.8 },
    POWERUP: { COUNT: 12 },
    MOVE: { MAX_SPEED: 20 },
    MAZE: { W: 15, H: 15 },
    skybox: [
      "./skybox/redeclipse_ft.png",
      "./skybox/redeclipse_bk.png",
      "./skybox/redeclipse_up.png",
      "./skybox/redeclipse_dn.png",
      "./skybox/redeclipse_rt.png",
      "./skybox/redeclipse_lf.png",
    ],
  },
  {
    // Level 3: Hard
    name: "Level 3",
    ENEMY: { TARGET_COUNT: 12, SPEED: 2.2 },
    POWERUP: { COUNT: 6 },
    MOVE: { MAX_SPEED: 22 },
    MAZE: { W: 19, H: 19 },
    skybox: [
      "./skybox/space_ft.png",
      "./skybox/space_bk.png",
      "./skybox/space_up.png",
      "./skybox/space_dn.png",
      "./skybox/space_rt.png",
      "./skybox/space_lf.png",
    ],
  },
];

// Apply a level preset by mutating the exported objects in-place.
// We mutate so other modules that imported these objects see updates.
export function applyLevelPreset(levelNumber) {
  const idx = Math.max(0, Math.min(LEVELS.length - 1, levelNumber - 1));
  const preset = LEVELS[idx] || {};

  // Helper: copy keys into target object (shallow)
  function applyTo(target, patch) {
    if (!patch || typeof patch !== "object") return;
    Object.keys(patch).forEach((k) => {
      // if nested object exists, merge shallowly
      if (
        typeof patch[k] === "object" &&
        patch[k] !== null &&
        target[k] &&
        typeof target[k] === "object"
      ) {
        Object.assign(target[k], patch[k]);
      } else {
        target[k] = patch[k];
      }
    });
  }

  // Apply to known exported objects
  applyTo(ENEMY, preset.ENEMY);
  applyTo(POWERUP, preset.POWERUP);
  applyTo(MOVE, preset.MOVE);
  applyTo(MAZE, preset.MAZE);
  applyTo(WORLD, preset.WORLD);
}
