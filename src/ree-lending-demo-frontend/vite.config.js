import path from "path";
import { fileURLToPath, URL } from "url";
import dotenv from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import environment from "vite-plugin-environment";
import inject from "@rollup/plugin-inject";

dotenv.config({ path: "../../.env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    target: "esnext",
    commonjsOptions: {
      transformMixedEsModules: true,
      requireReturnsDefault: "namespace",
    },
  },

  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
        "process.env": "{}",
      },
    },

    include: ["bip39", "tiny-secp256k1", "bitcoinjs-lib", "buffer"],
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

    {
      ...inject({
        Buffer: ["buffer", "Buffer"],
      }),
      enforce: "post",
      apply: "build",
    },
  ],

  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },

      { find: "buffer", replacement: "buffer/" },
    ],

    dedupe: ["@dfinity/agent"],
  },
});
