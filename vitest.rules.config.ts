import { defineConfig } from "vitest/config";

// Security-rules tests. Run only inside the Firebase emulators:
//   pnpm test:rules
// Kept out of the default `pnpm test` run because they need Java + the
// emulator jars.
export default defineConfig({
  test: {
    include: ["rules-tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
