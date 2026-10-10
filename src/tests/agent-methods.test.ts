import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listToolDefinitions } from 'taibu-core/mcp';
import { ANALYSIS_GUIDES } from '../lib/agent/analysis-methods.generated';
import { ANALYSIS_METHODS, loadAnalysisMethod } from '../lib/agent/methods.server';

test('every Core tool loads the original guide and shared tools keep their aliases', () => {
    assert.equal(Object.keys(ANALYSIS_GUIDES).length, 11);
    assert.deepEqual(ANALYSIS_METHODS.map(item => item.id).sort(), listToolDefinitions().map(item => item.name).sort());
    for (const method of ANALYSIS_METHODS) {
        const loaded = loadAnalysisMethod(method.id);
        const source = readFileSync(`skills/taibu-divination/interpretation/${method.guide}.md`, 'utf8');
        assert.equal(ANALYSIS_GUIDES[method.guide].body, source);
        assert.equal(loaded.instructions, source + '\n计算必须调用 Core 工具；方法包不授予工具、联网或会员权限。');
        assert.ok(loaded.tools.includes(method.id));
        assert.equal(loadAnalysisMethod(method.guide).guide, method.guide);
    }
    assert.throws(() => loadAnalysisMethod('__proto__'));
    assert.throws(() => loadAnalysisMethod('bazi', 'unknown'));
});
