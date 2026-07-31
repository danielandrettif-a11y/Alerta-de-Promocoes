#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const files = [
  path.join(root, 'server.js'),
  path.join(root, 'public', 'app.js'),
  path.join(root, 'extension', 'background.js'),
  path.join(root, 'extension', 'popup.js'),
  path.join(root, 'extension', 'options.js'),
  path.join(root, 'extension', 'content', 'mercado_livre.js'),
  path.join(root, 'extension', 'content', 'shopee.js'),
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
