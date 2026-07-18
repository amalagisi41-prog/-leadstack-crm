import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Orphaned pre-rename scaffold directory — a single throwaway debug
      // script, not part of the Next.js app (nothing under src/ references
      // it) and not the app this repo builds/deploys.
      "my-ghl-app/**",
    ],
  },
];

export default eslintConfig;
