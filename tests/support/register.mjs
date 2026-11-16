import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../src");
const cookieStub = path.join(here, "next-headers.ts");
const nextServer = path.resolve(here, "../../node_modules/next/dist/server/web/exports/index.js");

function firstExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return { url: pathToFileURL(cookieStub).href, shortCircuit: true };
    }

    if (specifier === "next/server" && existsSync(nextServer)) {
      return { url: pathToFileURL(nextServer).href, shortCircuit: true };
    }

    if (specifier.startsWith("@/")) {
      const base = path.join(srcRoot, specifier.slice(2));
      const hit = firstExisting([
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
      ]);
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }

    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const parent = fileURLToPath(context.parentURL);
      const base = path.resolve(path.dirname(parent), specifier);
      if (!path.extname(specifier)) {
        const hit = firstExisting([
          `${base}.ts`,
          `${base}.tsx`,
          path.join(base, "index.ts"),
          path.join(base, "index.tsx"),
        ]);
        if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
