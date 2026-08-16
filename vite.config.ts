import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@pkmn/core": r("./packages/core/src/index.ts"),
      "@pkmn/data": r("./packages/data/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
  },
});
