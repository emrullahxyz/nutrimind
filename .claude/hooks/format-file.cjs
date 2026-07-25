#!/usr/bin/env node
// PostToolUse formatter for Edit|Write: runs Prettier on the file Claude just touched.
const { spawnSync } = require("node:child_process");

const FORMATTABLE = /\.(ts|tsx|js|jsx|json|css|md|yml|yaml)$/;

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
  if (!filePath || !FORMATTABLE.test(filePath)) process.exit(0);

  spawnSync("pnpm", ["exec", "prettier", "--write", "--ignore-unknown", filePath], {
    stdio: "ignore",
    shell: true,
  });
  process.exit(0);
});
