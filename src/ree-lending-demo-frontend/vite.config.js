import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import environment from "vite-plugin-environment";
import dotenv from "dotenv";

import { nodePolyfills } from "vite-plugin-node-polyfills";

dotenv.config({ path: "../../.env" });

export default defineConfig({
  build: {
    emptyOutDir: true,
    commonjsOptions: {
      transformMixedEsModules: true,
      requireReturnsDefault: "namespace",
    },
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
    include: ["bip39", "tiny-secp256k1", "bitcoinjs-lib"],
  },
  server: {
    proxy: {
      "/api": {
        target: "https://icp0.io",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    tailwindcss(),
    nodePolyfills({
      globals: {
        Buffer: true,
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
    dedupe: ["@dfinity/agent"],
  },
});
