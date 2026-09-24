import { build } from "esbuild";
import { writeFileSync } from "node:fs";

/**
 * Bundles the Lambda handler into a single self-contained CommonJS file.
 *
 * `@aws-sdk/*` is left external because the Lambda Node 24 runtime already
 * ships it. A tiny `dist/package.json` with `type: commonjs` is written so the
 * runtime treats `lambda.js` as CommonJS (the repo root is `type: module`).
 */
await build({
  entryPoints: ["src/lambda.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist/lambda.js",
  external: ["@aws-sdk/*"],
  minify: true,
  sourcemap: false,
});

writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }) + "\n");

console.log("✅ Built dist/lambda.js (CommonJS) + dist/package.json");
