const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return structuredClone(fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return structuredClone(fallback);
  }
}

function saveJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath =
    `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(value, null, 2),
    'utf-8'
  );
  fs.renameSync(temporaryPath, filePath);
}

module.exports = {
  loadJson,
  saveJsonAtomic
};
