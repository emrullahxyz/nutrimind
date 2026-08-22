#!/usr/bin/env node
// PostToolUse hook: when Claude edits a source file that has a sibling *.test.ts
// (or *.test.tsx), run just that test file for fast feedback. Full-suite runs are
// expensive (hundreds of tests); a matched test is cheap and catches regressions early.
// Silently no-ops when no matching test exists.
const { spawnSync } = require("node:child_process");
const { existsSync, writeSync } = require("node:fs");

// Path may be relative ("src/lib/foo.ts") or absolute ("C:\\p\\src\\lib\\foo.ts").
const SRC_TESTS_RE = /(^|[\\/])src[\\/](lib|components)[\\/][^\\/]+\.(ts|tsx)$/;

let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = input?.tool_response?.filePath ?? input?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const base = filePath.replace(/\.tsx?$/, "");
  if (!SRC_TESTS_RE.test(filePath)) process.exit(0);

  const candidates = [
    `${base}.test.ts`,
    `${base}.test.tsx`,
  ];
  const matched = candidates.find((c) => existsSync(c));
  if (!matched) process.exit(0);

  // Pass the filter as a glob (e.g. "nutrition.test.ts"), never a non-test file:
  // vitest treats the arg as a filter, and a source file matches nothing.
  // Explicit pipes (not "inherit") so the hook's output is deterministic even
  // when the parent's stdio is redirected (CI, pipe feeds).
  const r = spawnSync("pnpm", ["exec", "vitest", "run", matched], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    encoding: "utf8",
  });
  // writeSync (not process.stdout.write): stdout is async when redirected to a
  // pipe/file, and the process would exit before the queued write flushes.
  if (r.stdout) writeSync(1, r.stdout);
  if (r.stderr) writeSync(2, r.stderr);
  process.exit(r.status === 0 ? 0 : 1);
});