import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const wasmMimePlugin = (): import("vite").Plugin => ({
  name: "wasm-mime",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url?.split("?")[0];
      const wasmEntry =
        url &&
        Object.entries({
          "tfhe_bg.wasm": path.resolve(__dirname, "node_modules/@zama-fhe/relayer-sdk/lib/tfhe_bg.wasm"),
          "kms_lib_bg.wasm": path.resolve(__dirname, "node_modules/@zama-fhe/relayer-sdk/lib/kms_lib_bg.wasm"),
        }).find(([name]) => url.endsWith(name));

      if (wasmEntry) {
        const [, filePath] = wasmEntry;
        res.setHeader("Content-Type", "application/wasm");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        if (fs.existsSync(filePath)) {
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [
    react(),
    nodePolyfills(),
    wasmMimePlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      util: "util",
      stream: "stream-browserify",
      process: "process/browser",
      buffer: "buffer",
    },
  },
  define: {
    global: "globalThis",
    "process.env": {},
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    include: ["util", "buffer", "process", "stream-browserify"],
    esbuildOptions: {
      loader: {
        ".wasm": "file",
      },
      define: {
        global: "globalThis",
      },
    },
  },
}));
