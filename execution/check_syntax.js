#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const files = [
  path.join(root, 'server.js'),
  path.join(root, 'public', 'app.js'),
  ...fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(__dirname, file))
];

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`[syntax] FALHA: ${path.relative(root, file)}`);
    console.error(result.stderr.trim());
  } else {
    console.log(`[syntax] OK: ${path.relative(root, file)}`);
  }
}

process.exitCode = failed ? 1 : 0;
