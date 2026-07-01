import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
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
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
