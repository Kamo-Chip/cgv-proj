import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MAZE } from "./constants.js";
import { gridToWorld } from "./utils.js";
// Floor model support removed; placeholder file retained intentionally.
const DEFAULT_MODEL_URL = "./models/items/floor.glb";
