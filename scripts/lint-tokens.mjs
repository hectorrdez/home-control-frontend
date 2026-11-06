// Fails when a hex or rgb() color literal appears in src/**/*.{ts,tsx} outside src/index.css.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const allowed = join(srcDir, "index.css");
const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx?|ts)$/.test(entry.name)) out.push(path);
  }
  return out;
}

let failures = 0;
for (const file of walk(srcDir)) {
  if (file === allowed) continue;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!pattern.test(line)) return;
      failures++;
      console.log(relative(root, file) + ":" + (i + 1) + ": color literal, use a token: " + line.trim());
    });
}

if (failures > 0) {
  console.log("FAIL: " + failures + " color literal(s) outside src/index.css");
  process.exit(1);
}
console.log("PASS: no color literals outside src/index.css");
