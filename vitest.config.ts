import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const resolve = {
  // Honor tsconfig "paths" (the @/* alias) natively.
  tsconfigPaths: true,
  alias: {
    // `import "server-only"` throws outside a React Server Component bundle.
    // Alias it to an empty module so server route/lib code is importable in
    // the Node test environment.
    "server-only": fileURLToPath(
      new URL("./test/stubs/server-only.ts", import.meta.url),
    ),
  },
};

/**
 * Two projects rather than one environment.
 *
 * Library and route tests (`.test.ts`) run in Node — they exercise server
 * code and a DOM would only slow them down. Component tests (`.test.tsx`)
 * run in jsdom with Testing Library's matchers and automatic cleanup.
 * Splitting on the file extension means the pre-existing suite runs exactly
 * as it did before component tests existed.
 */
export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "test/**/*.test.ts",
            "middleware/**/*.test.ts",
            "templates/**/*.test.ts",
          ],
        },
      },
      {
        resolve,
        // tsconfig sets jsx: "preserve" because Next.js does its own
        // transform at build time. Tests have no such step, so this project
        // compiles JSX itself. Vite 8 ignores the `esbuild` option, hence the
        // plugin rather than a one-line transform setting.
        plugins: [react()],
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./test/setup-dom.ts"],
          include: ["src/**/*.test.tsx", "test/**/*.test.tsx"],
        },
      },
    ],
  },
});
