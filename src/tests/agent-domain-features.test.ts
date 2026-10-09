import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPromptTemplates, applyPromptTemplate } from '../lib/agent/prompt-templates';

test('templates are bounded and substitute draft text literally', () => {
    const template = { id: 'career', name: '事业', content: '请分析：{{question}}' };
    assert.ok(validPromptTemplates([template]));
    assert.equal(applyPromptTemplate(template, '$&\n问题'), '请分析：$&\n问题');
    assert.ok(!validPromptTemplates([template, template]));
    assert.ok(!validPromptTemplates([{ ...template, name: '' }]));
    assert.ok(!validPromptTemplates(Array.from({ length: 21 }, (_, i) => ({ ...template, id: String(i) }))));
});

