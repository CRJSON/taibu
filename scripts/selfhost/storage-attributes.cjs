'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const KEYS = Object.freeze(['user.supabase.cache-control', 'user.supabase.content-type']);
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const MAX_VALUE_BYTES = 4096;
function invalid() { throw new Error('文件存储属性备份无效或不完整'); }
function safePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\\x00-\x1f]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')
    || Buffer.byteLength(value) > 4095 || Buffer.from(value).toString('utf8') !== value) invalid();
  return value;
}
function validateAttributes(raw) {
  if (Buffer.byteLength(raw) > MAX_BYTES) invalid();
  const document = JSON.parse(raw.toString());
  if (!document || document.version !== 1 || !Array.isArray(document.entries)
    || Object.keys(document).sort().join(',') !== 'entries,version' || document.entries.length > MAX_ENTRIES) invalid();
  const seen = new Set();
  for (const entry of document.entries) {
    if (!entry || Object.keys(entry).sort().join(',') !== 'attributes,kind,path') invalid();
    safePath(entry.path);
    if (seen.has(entry.path) || !['file', 'directory'].includes(entry.kind)
      || !entry.attributes || Array.isArray(entry.attributes) || typeof entry.attributes !== 'object') invalid();
    seen.add(entry.path);
    for (const [key, value] of Object.entries(entry.attributes)) {
      if (!KEYS.includes(key) || typeof value !== 'string' || value.length > Math.ceil(MAX_VALUE_BYTES / 3) * 4) invalid();
      const decoded = Buffer.from(value, 'base64');
      if (decoded.length > MAX_VALUE_BYTES || decoded.toString('base64') !== value) invalid();
    }
    // Missing metadata on a completed object is a broken backup, not an empty
    // optional attribute: Storage GET requires both keys on every object file.
    if (entry.kind === 'file' && KEYS.some(key => !Object.hasOwn(entry.attributes, key))) invalid();
  }
  return document;
}
async function listEntries(root) {
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) invalid();
  const entries = [];
  let pathBytes = 0;
  async function visit(relative) {
    const directory = await fs.opendir(path.join(root, relative));
    for await (const child of directory) {
      const name = safePath(relative ? `${relative}/${child.name}` : child.name);
      pathBytes += Buffer.byteLength(name) + 64;
      if (pathBytes > MAX_BYTES) invalid();
      const stat = await fs.lstat(path.join(root, name));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1)) invalid();
      entries.push({ path: name, kind: stat.isDirectory() ? 'directory' : 'file' });
      if (entries.length > MAX_ENTRIES) invalid();
      if (stat.isDirectory()) await visit(name);
    }
  }
  await visit('');
  return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
async function capture(root, xattr) {
  const entries = await listEntries(root);
  let serializedBytes = 64;
  for (const entry of entries) {
    entry.attributes = {};
    for (const key of KEYS) {
      try {
        const value = await xattr.get(path.join(root, entry.path), key);
        if (!Buffer.isBuffer(value) || value.length > MAX_VALUE_BYTES) invalid();
        entry.attributes[key] = value.toString('base64');
      } catch (error) {
        if (entry.kind !== 'directory' || !['ENODATA', 'ENOATTR'].includes(error.code)) throw new Error('读取文件存储必需属性失败');
      }
    }
    serializedBytes += Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (serializedBytes > MAX_BYTES) invalid();
  }
  const raw = Buffer.from(JSON.stringify({ version: 1, entries }));
  validateAttributes(raw);
  return raw;
}
async function restore(root, raw, xattr) {
  const document = validateAttributes(raw);
  const actual = await listEntries(root);
  const expected = new Map(document.entries.map(entry => [entry.path, entry]));
  if (actual.length !== expected.size || actual.some(entry => expected.get(entry.path)?.kind !== entry.kind)) invalid();
  // Complete path/type/attribute preflight happens before the first xattr write.
  for (const entry of actual) {
    for (const [key, value] of Object.entries(expected.get(entry.path).attributes)) {
      await xattr.set(path.join(root, entry.path), key, Buffer.from(value, 'base64'));
    }
  }
  // Read-after-write verifies no Storage object will be started with lost attrs.
  const captured = validateAttributes(await capture(root, xattr));
  for (const entry of captured.entries) {
    const attributes = expected.get(entry.path).attributes;
    if (KEYS.some(key => attributes[key] !== entry.attributes[key])) invalid();
  }
}
async function main() {
  if (!['capture', 'restore'].includes(process.argv[2]) || process.argv.length !== 3) invalid();
  const xattr = require('/app/node_modules/fs-xattr');
  if (process.argv[2] === 'capture') process.stdout.write(await capture('/storage', xattr));
  else {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > MAX_BYTES) invalid();
      chunks.push(chunk);
    }
    await restore('/storage', Buffer.concat(chunks), xattr);
  }
}
module.exports = { validateAttributes, capture, restore, KEYS, MAX_BYTES };
if (require.main === module) main().catch(() => { console.error('文件存储属性操作失败；拒绝不完整备份或恢复'); process.exitCode = 1; });
