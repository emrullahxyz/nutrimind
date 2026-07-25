#!/usr/bin/env node
// PreToolUse guard for Edit|Write: blocks edits to design-reference / seed-source files
// that CLAUDE.md marks as read-only (never ship, never edit as source).
const PROTECTED_BASENAMES = new Set([
  "support.js",
  "Besin Hafızası.dc.html",
  "Wireframes.dc.html",
  "eski veriler ('Emrullah' kullanıcısı).json",
]);

let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // can't parse -> don't block
  }

  const filePath = input?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const basename = filePath.split(/[\\/]/).pop();
  if (!PROTECTED_BASENAMES.has(basename)) process.exit(0);

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `"${basename}" is a read-only design reference / seed source (see CLAUDE.md: design references only, never ship or edit as source). Update README.md's product spec instead if the design needs to change.`,
      },
    }),
  );
});
