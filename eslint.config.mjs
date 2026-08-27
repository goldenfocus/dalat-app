import nextConfig from "eslint-config-next";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "public/sw.js",
      "scripts/**",
    ],
  },
  ...nextConfig,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      // Allow underscore-prefixed unused variables (common convention)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow require() in config files
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      // Warn on console.log (allow console.error, console.warn for error handling)
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // React Compiler is not enabled for this app. Keep its migration
      // diagnostics visible without making legacy, working components fail CI.
      // Core Rules of Hooks violations remain errors through eslint-config-next.
      "react-hooks/error-boundaries": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];

export default eslintConfig;
