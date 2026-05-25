import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const workerConfig = {
  entryPoints: ["src/worker.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/worker.js",
  sourcemap: true,
  external: ["@paperclipai/plugin-sdk"],
};

const uiConfig = {
  entryPoints: ["src/ui/index.tsx"],
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "esm",
  outfile: "dist/ui/index.js",
  sourcemap: true,
  external: ["react", "react-dom", "@paperclipai/plugin-sdk"],
  jsx: "automatic",
};

if (isWatch) {
  const [workerCtx, uiCtx] = await Promise.all([
    context(workerConfig),
    context(uiConfig),
  ]);
  await Promise.all([workerCtx.watch(), uiCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([build(workerConfig), build(uiConfig)]);
  console.log("Build complete.");
}
