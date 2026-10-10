import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analysisMethodsSource, skillConventions, target } from '../build-analysis-methods.mjs';
import { listToolDefinitions } from '../../packages/core/dist/mcp/index.js';
import { TOOL_GUIDES, SKILL_DIR, requireGuide } from '../skill-guides.mjs';
import path from 'node:path';

test('shared conventions retain every line through the next heading or end of file', () => {
  const body = '- 历法：公历\n- 时间：钟表小时\n- 用神：按占问\n';
  assert.equal(skillConventions(`prefix\n## 约定\n\n${body}\n## 其他\nnot conventions`), body.trim());
  assert.equal(skillConventions(`## 约定\r\n${body.replaceAll('\n', '\r\n')}`), body.replaceAll('\n', '\r\n').trim());
  assert.throws(() => skillConventions('## 其他\nbody'), /缺少约定段/);
});

test('Agent guide artifact is current and every Core tool has a guide', async () => {
  assert.deepEqual(Object.keys(TOOL_GUIDES).sort(), listToolDefinitions().map(tool => tool.name).sort());
  for (const tool of listToolDefinitions()) assert.ok(requireGuide(tool.name));
  assert.equal(readFileSync(target, 'utf8'), await analysisMethodsSource());
  // Parse the source by lines independently of the generator's section regex.
  const lines = readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8').split(/\r?\n/);
  const start = lines.indexOf('## 约定') + 1;
  assert.ok(start > 0);
  const next = lines.findIndex((line, index) => index >= start && line.startsWith('## '));
  const expected = lines.slice(start, next < 0 ? undefined : next).join('\n').trim();
  const encoded = /export const ANALYSIS_CONVENTIONS = (.+);/.exec(readFileSync(target, 'utf8'))?.[1];
  assert.equal(JSON.parse(encoded), expected);
});
