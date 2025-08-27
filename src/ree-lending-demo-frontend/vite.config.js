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
    // 关键：不要自定义 commonjsOptions，避免破坏 CJS ↔ ESM 互操作
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
    // 你需要把 .env 中以 CANISTER_/DFX_ 开头的变量注入的话，可以保留这个
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
    // 这里顺手把 react/react-dom 也去重，避免幽灵副本
    dedupe: ["react", "react-dom", "@dfinity/agent"],
  },
});
