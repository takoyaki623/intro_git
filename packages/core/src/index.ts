/**
 * packages/core — ルールエンジン。
 * Phaser にも DOM にも依存しない純粋な TypeScript。
 */

export * from "./types.js";
export * from "./gamedata.js";
export * from "./rng.js";
export * from "./stats.js";
export * from "./stages.js";
export * from "./status.js";
export * from "./typechart.js";
export * from "./held.js";
export * from "./damage.js";
export * from "./effects.js";
export * from "./normalize.js";
export * from "./battle.js";
export * from "./endgame/ruleset.js";
export * from "./endgame/facility.js";
export * from "./save/store.js";
export { chooseRandomAction } from "./ai/random.js";
export * from "./ai/view.js";
export * from "./ai/basic.js";
