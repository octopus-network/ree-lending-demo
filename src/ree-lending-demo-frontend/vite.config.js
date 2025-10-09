import path from "path";
import { fileURLToPath, URL } from "url";
import dotenv from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import environment from "vite-plugin-environment";

dotenv.config({ path: "../../.env" });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    target: "esnext",
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@radix-ui/react-compose-refs",
      "@radix-ui/react-slot",
      "@radix-ui/react-dialog",
      "@radix-ui/react-tabs",
      "bip39",
      "tiny-secp256k1",
      "bitcoinjs-lib",
      "buffer",
      "process",
    ],
    esbuildOptions: {
      define: {
        global: "globalThis",
        "process.env": "{}",
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "https://icp0.io", changeOrigin: true },
    },
  },
  plugins: [
    react(),
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    tailwindcss(),
  ],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "buffer", replacement: "buffer/" },
      { find: "process", replacement: "process/browser" },
    ],
    dedupe: ["react", "react-dom", "@dfinity/agent"],
  },
});
