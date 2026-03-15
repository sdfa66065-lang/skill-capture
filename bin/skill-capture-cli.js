#!/usr/bin/env node

/**
 * NPM wrapper for SkillCapture CLI.
 * Uses `uvx` (or falls back to `pipx`/`npx`) to run the Python package.
 */

const { spawnSync } = require('child_process');

function checkCommand(cmd) {
  try {
    spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

const args = process.argv.slice(2);
let command;
let runArgs;

if (checkCommand('uvx')) {
  // Option 1: Fast installation via uvx
  command = 'uvx';
  runArgs = ['skill-capture', 'skill-capture-cli', ...args];
} else if (checkCommand('pipx')) {
  // Option 2: pipx
  command = 'pipx';
  runArgs = ['run', 'skill-capture', 'skill-capture-cli', ...args];
} else {
  console.error("❌ SkillCapture requires 'uv' or 'pipx' to run via npx.");
  console.error("Please install uv (https://docs.astral.sh/uv/) and try again:");
  console.error("  curl -LsSf https://astral.sh/uv/install.sh | sh");
  process.exit(1);
}

const result = spawnSync(command, runArgs, {
  stdio: 'inherit',
  shell: true
});

process.exit(result.status ?? 1);
