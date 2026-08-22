#!/usr/bin/env node
// PreToolUse guard for Edit|Write: blocks edits to files CLAUDE.md marks as
// forbidden — design references / seed sources, the live SQLite database, and
// the frozen backend entrypoint. "deny" surfaces a chooser to the user, so a
// justified override (e.g. an authorized isolated-module bridge) is still possible.
const PROTECTED_BASENAMES = new Set([
  "support.js",
  "Besin Hafızası.dc.html",
  "Wireframes.dc.html",
  // Live SQLite file — subagents have run `node server/index.js` unprompted
  // and written here (see lessons). Never let an Edit touch it.
  "data.db",
]);
// CLAUDE.md: "server/index.js donmuş kabul edilir — değiştirmeden önce sor."
const FROZEN_ENTRYPOINTS = new Set(["index.js"]);

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
  if (PROTECTED_BASENAMES.has(basename)) {
    const reason =
      basename === "data.db"
        ? `"data.db" is the live SQLite database. Subagents have run the server and written here unprompted (see lessons). Editing it directly risks corrupting live data — go through the app's mutating API endpoints instead.`
        : `"${basename}" is a read-only design reference / seed source (see CLAUDE.md: design references only, never ship or edit as source). Update README.md's product spec instead if the design needs to change.`;
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      }),
    );
    process.exit(0);
  }

  // Freeze server/index.js specifically (not ai.js or other isolated modules).
  // Path may be relative ("server/index.js") or absolute — anchor on ^ too.
  const inServerDir = /(^|[\/\\])server[\/\\]/.test(filePath);
  if (inServerDir && FROZEN_ENTRYPOINTS.has(basename)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `"server/index.js" is frozen (see CLAUDE.md: ask before changing). New backend logic belongs in an isolated module like server/ai.js, wired in via a require() + single if-route block.`,
        },
      }),
    );
    process.exit(0);
  }
});
