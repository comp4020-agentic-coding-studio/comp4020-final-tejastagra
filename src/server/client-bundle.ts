// Bundles the browser code with esbuild (ADR 0001). Built once at server
// start into memory; `pnpm dev`'s --watch restarts the whole process on any
// source change, including these entry points, so there is no separate watch
// mode to run.
import { buildSync } from "esbuild";

export function bundleClient(entryPoint: string): string {
  const result = buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2020",
    sourcemap: false,
  });
  return result.outputFiles[0].text;
}
