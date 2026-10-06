import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailField, resolveAuthEmail } from '../components/auth/LoginForm';

for (const [prefix, suffix, expected] of [
    ['demo@taibu.local', '@qq.com', 'demo@taibu.local'],
    ['  demo@taibu.local  ', '@gmail.com', 'demo@taibu.local'],
    ['admin@custom.example', '@qq.com', 'admin@custom.example'],
    ['alice', '@qq.com', 'alice@qq.com'],
    ['alice', '@gmail.com', 'alice@gmail.com'],
    [' alice ', '@qq.com', ' alice @qq.com'],
] as const) {
    test(`auth email composition accepts full addresses and preserves shortcuts: ${prefix}`, () => {
        assert.equal(resolveAuthEmail(prefix, suffix), expected);
    });
}

test('shared email field disables suffix selection only for a complete-address input', () => {
    const render = (emailPrefix: string) => renderToStaticMarkup(createElement(EmailField, {
        emailPrefix,
        emailSuffix: '@qq.com',
        emailSuffixes: ['@qq.com', '@gmail.com'],
        onEmailPrefixChange: () => {},
        onEmailSuffixChange: () => {},
    }));
    const fullAddress = render('demo@taibu.local');
    assert.match(fullAddress, /<select[^>]*disabled=""/);
    assert.match(fullAddress, /完整邮箱/);
    assert.doesNotMatch(fullAddress, /<option[^>]*value="@qq.com"/);
    assert.match(fullAddress, /placeholder="邮箱前缀或完整邮箱"/);
    assert.match(fullAddress, /value="demo@taibu.local"/);

    const prefixOnly = render('demo');
    assert.doesNotMatch(prefixOnly, /<select[^>]*disabled=""/);
    assert.match(prefixOnly, /<option value="@qq.com" selected="">/);
    assert.match(prefixOnly, /<option value="@gmail.com">/);
    assert.doesNotMatch(prefixOnly, /完整邮箱<\/option>/);
});
