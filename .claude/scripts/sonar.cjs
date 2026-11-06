#!/usr/bin/env node
// sonar.cjs - run a SonarQube analysis, wait for the server, print quality gate + issues.
// Usage: node .claude/scripts/sonar.cjs [--sources=src] [--exclusions=glob,glob] [--key=projectKey] [--tests=dir] [--lcov=path]
// Exit: 0 gate OK and no OPEN issues, 1 gate ERROR or OPEN issues, 2 could not run.
// Config (env overrides): SONAR_HOST_URL (default https://sonarqube.hectorrdez.es),
//   SONAR_TOKEN or SONAR_TOKEN_FILE (default: first `sonar.token` found walking up from cwd).
// The token is NEVER printed or written to disk. Scanner home lives inside the repo (.sonar-home)
// so sandboxed agents (e.g. luna/codex) can execute the downloaded JRE.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=") || "true"];
  }),
);
const root = process.cwd();
const host = (process.env.SONAR_HOST_URL || "https://sonarqube.hectorrdez.es").replace(/\/+$/, "");

function findTokenFile() {
  if (process.env.SONAR_TOKEN_FILE) return process.env.SONAR_TOKEN_FILE;
  let dir = root;
  for (;;) {
    const f = path.join(dir, "sonar.token");
    if (fs.existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
let token = process.env.SONAR_TOKEN;
if (!token) {
  const f = findTokenFile();
  if (f && fs.existsSync(f)) token = fs.readFileSync(f, "utf8").trim();
}
if (!token) {
  console.error("sonar: no token (set SONAR_TOKEN or put sonar.token in a parent folder)");
  process.exit(2);
}

const pkg = fs.existsSync("package.json") ? JSON.parse(fs.readFileSync("package.json", "utf8")) : {};
const key = args.key || pkg.name || path.basename(root);
const sources = args.sources || (fs.existsSync("src") ? "src" : ".");
const exclusions = args.exclusions || "**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/.scannerwork/**,**/design/**,**/tests/bruno/**,**/e2e/**";
const home = path.join(root, ".sonar-home");
fs.mkdirSync(home, { recursive: true });

const props = [
  `-Dsonar.host.url=${host}`,
  `-Dsonar.projectKey=${key}`,
  `-Dsonar.projectName=${key}`,
  `-Dsonar.sources=${sources}`,
  `-Dsonar.exclusions=${exclusions}`,
  `-Dsonar.userHome=${home}`,
  `-Dsonar.scm.disabled=true`,
];
if (args.tests) props.push(`-Dsonar.tests=${args.tests}`);
if (args.lcov) props.push(`-Dsonar.javascript.lcov.reportPaths=${args.lcov}`);

console.log(`sonar: analysing ${key} @ ${host}`);
const env = { ...process.env, SONAR_TOKEN: token, SONAR_USER_HOME: home };
// Run npx through the current node binary (no cmd.exe / shell: works in restricted sandboxes).
const npxCli = [
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
  path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
].find((p) => fs.existsSync(p));
// Output goes to a log file (not pipes): sandboxed agents (codex/luna) get EPERM on piped child stdio.
const logFile = path.join(root, ".sonar-scan.log");
const fd = fs.openSync(logFile, "w");
const stdio = ["ignore", fd, fd];
// Prefer a globally installed scanner (`npm i -g @sonar/scan`): sandboxed agents cannot reach the npm registry.
const globalScan = [
  process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@sonar", "scan", "bin", "sonar-scanner.js"),
  path.join(path.dirname(process.execPath), "node_modules", "@sonar", "scan", "bin", "sonar-scanner.js"),
  path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "@sonar", "scan", "bin", "sonar-scanner.js"),
].find((p) => p && fs.existsSync(p));
const r = globalScan
  ? spawnSync(process.execPath, [globalScan, ...props], { env, stdio })
  : npxCli
  ? spawnSync(process.execPath, [npxCli, "--yes", "@sonar/scan", ...props], { env, stdio })
  : spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "@sonar/scan", ...props], { env, stdio, shell: process.platform === "win32" });
fs.closeSync(fd);
const out = fs.readFileSync(logFile, "utf8").split(token).join("***");
fs.writeFileSync(logFile, out);
if (r.status !== 0) {
  console.error(out.split("\n").slice(-25).join("\n"));
  console.error("sonar: scanner failed (exit " + r.status + (r.error ? ", " + r.error.code + " " + r.error.syscall + " " + r.error.path : "") + (r.signal ? ", signal " + r.signal : "") + ")");
  process.exit(2);
}
const m = out.match(/api\/ce\/task\?id=([\w-]+)/);

const auth = { headers: { Authorization: "Basic " + Buffer.from(token + ":").toString("base64") } };
const get = async (p) => {
  const res = await fetch(host + p, auth);
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.json();
};

(async () => {
  try {
    if (m) {
      for (let i = 0; i < 60; i++) {
        const t = (await get("/api/ce/task?id=" + m[1])).task;
        if (t.status === "SUCCESS") break;
        if (t.status === "FAILED" || t.status === "CANCELED") throw new Error("server analysis " + t.status);
        await new Promise((ok) => setTimeout(ok, 2000));
      }
    }
    const gate = (await get("/api/qualitygates/project_status?projectKey=" + encodeURIComponent(key))).projectStatus;
    const issues = await get(`/api/issues/search?componentKeys=${encodeURIComponent(key)}&resolved=false&ps=100`);
    const hs = await get(`/api/hotspots/search?projectKey=${encodeURIComponent(key)}&status=TO_REVIEW&ps=100`).catch(() => ({ hotspots: [] }));
    console.log(`QUALITY_GATE: ${gate.status}`);
    for (const c of gate.conditions || []) if (c.status !== "OK") console.log(`  condition ${c.metricKey}: ${c.status} (${c.actualValue} vs ${c.errorThreshold})`);
    console.log(`ISSUES_OPEN: ${issues.total}  HOTSPOTS_TO_REVIEW: ${hs.hotspots.length}`);
    for (const i of issues.issues) {
      console.log(`  [${i.severity}] ${i.component.split(":").slice(1).join(":")}:${i.line || "?"} ${i.rule} - ${i.message}`);
    }
    for (const h of hs.hotspots) console.log(`  [HOTSPOT] ${h.component.split(":").slice(1).join(":")}:${h.line || "?"} ${h.message}`);
    console.log(`DASHBOARD: ${host}/dashboard?id=${key}`);
    process.exit(gate.status === "OK" && issues.total === 0 && hs.hotspots.length === 0 ? 0 : 1);
  } catch (e) {
    console.error("sonar: " + String(e.message).split(token).join("***"));
    process.exit(2);
  }
})();
