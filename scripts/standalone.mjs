import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strToU8, zipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
let html = await readFile(resolve(root, "dist/index.html"), "utf8");
const jsMatch = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link\b[^>]*href="([^\"]+\.css)"[^>]*>/);
if (!jsMatch || !cssMatch)
  throw new Error("Expected a single Vite script and stylesheet.");
const readAsset = (path) =>
  readFile(resolve(root, "dist", path.replace(/^\//, "")), "utf8");
const script = (await readAsset(jsMatch[1])).replace(
  /<\/script/gi,
  "<\\/script",
);
const style = await readAsset(cssMatch[1]);
const favicon = await readFile(resolve(root, "public/favicon.svg"), "utf8");
html = html
  .replace(jsMatch[0], `<script type="module">${script}</script>`)
  .replace(cssMatch[0], `<style>${style}</style>`)
  .replace("/favicon.svg", `data:image/svg+xml,${encodeURIComponent(favicon)}`);
await writeFile(resolve(root, "dist/SensLab.html"), html);
const downloadDir = resolve(root, "downloads");
await mkdir(downloadDir, { recursive: true });
await writeFile(resolve(downloadDir, "SensLab.html"), html);
const quickStart = await readFile(resolve(downloadDir, "START_HERE.txt"));
// Fixed timestamps keep identical builds from changing the tracked ZIP unnecessarily.
const entryOptions = { mtime: new Date("2020-01-01T00:00:00Z") };
const zip = zipSync(
  {
    "SensLab/SensLab.html": [strToU8(html), entryOptions],
    "SensLab/START_HERE.txt": [new Uint8Array(quickStart), entryOptions],
  },
  { level: 9 },
);
await writeFile(resolve(downloadDir, "SensLab.zip"), zip);
console.log("Standalone browser app: dist/SensLab.html");
console.log("Download package: downloads/SensLab.zip");
