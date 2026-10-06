import { build } from "esbuild";
import {
  mkdir,
  rm,
  readFile,
  realpath,
  readdir,
  copyFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
await mkdir(".agent", { recursive: true });
// Next's standalone trace omits workspace packages it bundled into Web chunks.
// Keep the public Core package and its production dependencies beside the worker.
const coreDeployment = ".agent/node_modules/taibu-core";
await rm(coreDeployment, { recursive: true, force: true });
execFileSync(
  "pnpm",
  [
    "--filter",
    "taibu-core",
    "deploy",
    "--prod",
    "--legacy",
    "--frozen-lockfile",
    coreDeployment,
  ],
  { stdio: "inherit" },
);
// Legacy deploy retains the shared workspace's virtual store. Keep only Core's
// dependency graph, including optional/peer dependencies already installed.
const root = path.resolve(coreDeployment);
const visited = new Set();
const retained = new Set();
async function dependencyRoot(directory, name) {
  for (
    let current = directory;
    current.startsWith(root);
    current = path.dirname(current)
  ) {
    try {
      const resolved = await realpath(path.join(current, "node_modules", name));
      if (!resolved.startsWith(`${root}${path.sep}`))
        throw new Error(`Core runtime dependency escapes deployment: ${name}`);
      return resolved;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current === root) break;
  }
}
async function retain(directory) {
  if (visited.has(directory)) return;
  visited.add(directory);
  const relative = path.relative(
    path.join(root, "node_modules", ".pnpm"),
    directory,
  );
  if (!relative.startsWith("..")) retained.add(relative.split(path.sep)[0]);
  const manifest = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  const optional = {
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
  for (const name of new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(optional),
  ])) {
    const resolved = await dependencyRoot(directory, name);
    if (resolved) await retain(resolved);
    else if (!Object.hasOwn(optional, name))
      throw new Error(`Core runtime dependency missing: ${name}`);
  }
}
await retain(root);
const virtualStore = path.join(root, "node_modules", ".pnpm");
for (const entry of await readdir(virtualStore, { withFileTypes: true })) {
  if (
    entry.isDirectory() &&
    entry.name !== "node_modules" &&
    !retained.has(entry.name)
  )
    await rm(path.join(virtualStore, entry.name), {
      recursive: true,
      force: true,
    });
}
console.info(`Agent Core runtime: ${visited.size} packages`);
await mkdir(".agent/licenses", { recursive: true });
await copyFile("licenses/pi.LICENSE", ".agent/licenses/pi.LICENSE");
await copyFile("node_modules/undici/LICENSE", ".agent/licenses/undici.LICENSE");
await copyFile(
  "node_modules/ipaddr.js/LICENSE",
  ".agent/licenses/ipaddr.js.LICENSE",
);
await build({
  entryPoints: ["src/lib/agent/worker-entry.ts"],
  outfile: ".agent/worker.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  conditions: ["react-server"],
  logLevel: "warning",
  external: ["taibu-core", "taibu-core/*", "next", "next/*"],
  banner: {
    js: 'import { createRequire as agentCreateRequire } from "node:module"; const require = agentCreateRequire(import.meta.url);',
  },
  plugins: [
    {
      name: "server-only-marker",
      setup(builder) {
        builder.onResolve({ filter: /^next\/(?:headers|server)$/ }, (args) => ({
          path: `${args.path}.js`,
          external: true,
        }));
        builder.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "marker",
        }));
        builder.onLoad({ filter: /.*/, namespace: "marker" }, () => ({
          contents: "export {};",
          loader: "js",
        }));
      },
    },
  ],
});
