import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { installSettingsHistoryTracking, restoreCancelledSettingsNavigation } from '../lib/settings-navigation';
import { SETTINGS_CENTER_LEAVE_EVENT } from '../lib/settings-center';

function fixture(t: TestContext, native: boolean) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browser = new EventTarget();
  let index = 0;
  const entries: Array<{ href: string; state: unknown }> = [{ href: 'https://example.com/bazi', state: { __NA: true, tree: ['app'] } }];
  const goCalls: number[] = [];
  const location = new URL(entries[0].href);
  const move = (next: number, emit = false) => {
    index = next; location.href = entries[index].href;
    const event = Object.assign(new Event('popstate'), { state: entries[index].state }) as PopStateEvent;
    if (emit) browser.dispatchEvent(event);
    return event;
  };
  const history = {
    get state() { return entries[index].state; },
    pushState(state: unknown, _unused: string, href?: string | URL | null) { entries.splice(index + 1); entries.push({ state, href: href ? new URL(href, location).href : location.href }); move(index + 1); },
    replaceState(state: unknown, _unused: string, href?: string | URL | null) { entries[index] = { state, href: href ? new URL(href, location).href : location.href }; move(index); },
    go(delta: number) { goCalls.push(delta); move(index + delta, true); },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(browser, { history, location, ...(native ? { navigation: { currentEntry: { get index() { return index; } } } } : {}) }) });
  const stop = installSettingsHistoryTracking();
  t.after(() => { stop(); if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window'); });
  return { history, location, move, goCalls };
}

for (const native of [true, false]) {
  test(`cancelled Back restores the exact previous entry (${native ? 'native index' : 'history marker'})`, t => {
    const { history, location, move, goCalls } = fixture(t, native);
    history.pushState({ __NA: true, tree: ['settings'] }, '', '/settings/personalization');
    history.pushState({ __NA: true, tree: ['settings', 'general'] }, '', '/settings/general');
    restoreCancelledSettingsNavigation(move(0));
    assert.deepEqual(goCalls, [2]);
    assert.equal(location.pathname, '/settings/general');
    assert.equal((history.state as Record<string, unknown>).__NA, true);
    assert.deepEqual((history.state as Record<string, unknown>).tree, ['settings', 'general']);
  });
  test(`cancelled Forward goes backward rather than advancing again (${native ? 'native index' : 'history marker'})`, t => {
    const { history, location, move, goCalls } = fixture(t, native);
    history.pushState({ __NA: true }, '', '/settings/personalization');
    history.pushState({ __NA: true }, '', '/chat');
    move(1, true);
    restoreCancelledSettingsNavigation(move(2));
    assert.deepEqual(goCalls, [-1]);
    assert.equal(location.pathname, '/settings/personalization');
  });
  test(`Back asks before route subscribers discard the draft (${native ? 'native index' : 'history marker'})`, t => {
    const { history, location, move, goCalls } = fixture(t, native);
    history.pushState({ __NA: true, tree: ['settings'] }, '', '/settings/personalization');
    let dirty = true;
    let confirmations = 0;
    const destinations: string[] = [];
    window.addEventListener(SETTINGS_CENTER_LEAVE_EVENT, event => {
      if (dirty && !location.pathname.startsWith('/settings/')) { confirmations++; event.preventDefault(); }
    });
    window.addEventListener('popstate', () => {
      destinations.push(location.pathname);
      if (!location.pathname.startsWith('/settings/')) dirty = false;
    });
    move(0, true);
    assert.equal(confirmations, 1);
    assert.equal(dirty, true);
    assert.equal(location.pathname, '/settings/personalization');
    assert.deepEqual(goCalls, [1]);
    assert.deepEqual(destinations, ['/settings/personalization']);
  });
}
