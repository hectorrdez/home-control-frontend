// Post-build guard (108): the prod bundle must have no mock fixtures and three.js only in its lazy chunk.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "dist/assets";
const js = readdirSync(dir).filter((f) => f.endsWith(".js"));
const read = (f) => readFileSync(join(dir, f), "utf8");
const errors = [];

const mockMarkers = ["binary_sensor.entry_motion", "hc.mock.aliases", "Mock scenario", "alias-error"];
for (const f of js) {
  for (const m of mockMarkers) if (read(f).includes(m)) errors.push(`${f} contains mock marker "${m}"`);
}

const entry = js.find((f) => f.startsWith("index-"));
const threeChunk = js.find((f) => f.startsWith("three-") || f.startsWith("HouseStage-"));
if (!entry) errors.push("no index-*.js entry chunk");
if (!threeChunk) errors.push("no lazy three/HouseStage chunk");
if (entry && /WebGLRenderer/.test(read(entry))) errors.push(`${entry} contains three.js (WebGLRenderer)`);
if (threeChunk && !js.some((f) => /WebGLRenderer/.test(read(f)))) errors.push("three.js not found in any chunk");

if (errors.length) {
  console.error("check-bundle FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`check-bundle OK (${js.length} js chunks)`);
