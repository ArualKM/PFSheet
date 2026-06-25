import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const r = (p: string) => path.resolve(root, p);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/": `${r(".")}/`,
      "@pathforge/schema": r("packages/pathforge-schema/src/index.ts"),
      "@pathforge/rules-pf1e": r("packages/pathforge-rules-pf1e/src/index.ts"),
      "@pathforge/importers": r("packages/pathforge-importers/src/index.ts"),
      "@pathforge/exporters": r("packages/pathforge-exporters/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "packages/**/src/**/*.{test,spec}.{ts,tsx}",
      "lib/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/**/src/**", "lib/**"],
    },
  },
});
