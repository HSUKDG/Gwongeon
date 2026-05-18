import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function copyManifest(): Plugin {
  return {
    name: "copy-extension-manifest",
    closeBundle() {
      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/content.ts"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
