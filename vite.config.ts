import { defineConfig } from "vite";

export default defineConfig({
  // maplibre-gl v6 ships an ESM worker; pre-bundling rewrites its URL and the
  // worker fetch fails, which silently kills vector-tile rendering.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  worker: { format: "es" },
});
