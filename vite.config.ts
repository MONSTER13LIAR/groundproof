import { defineConfig } from "vite";

export default defineConfig({
  // Relative so the build works from a project subpath as well as a root domain.
  base: "./",
  // maplibre-gl v6 ships an ESM worker; pre-bundling rewrites its URL and the
  // worker fetch fails, which silently kills vector-tile rendering.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  worker: { format: "es" },
});
