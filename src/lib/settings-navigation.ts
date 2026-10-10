import { SETTINGS_CENTER_LEAVE_EVENT } from './settings-center';

const POSITION = '__taibuSettingsPosition';
type Entry = { position: number; nativeIndex?: number; state: unknown; href: string };
let current: Entry | undefined;

function position(state: unknown): number | undefined {
  const value = state && typeof state === 'object' ? (state as Record<string, unknown>)[POSITION] : undefined;
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}
function nativeIndex(): number | undefined {
  return (window as Window & { navigation?: { currentEntry?: { index?: number } } }).navigation?.currentEntry?.index;
}

/** Retain Next's history state and track direction for cancelled Back AND Forward. */
export function installSettingsHistoryTracking() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  const remember = (fallback: number) => { current = { position: position(history.state) ?? fallback, nativeIndex: nativeIndex(), state: history.state, href: window.location.href }; };
  const withPosition = (state: unknown, next: number) => ({ ...(state && typeof state === 'object' ? state : {}), [POSITION]: next });
  remember(0);
  replace.call(history, withPosition(history.state, current!.position), '', window.location.href);
  remember(0);
  const trackedPush: History['pushState'] = function (state: unknown, unused: string, url?: string | URL | null) {
    const next = (current?.position ?? 0) + 1;
    push.call(history, withPosition(state, next), unused, url);
    remember(next);
  };
  const trackedReplace: History['replaceState'] = function (state: unknown, unused: string, url?: string | URL | null) {
    const next = current?.position ?? 0;
    replace.call(history, withPosition(state, next), unused, url);
    remember(next);
  };
  // Ask before route subscribers run: they can synchronously unmount dirty forms.
  const pop = (event: PopStateEvent) => {
    const leave = new CustomEvent(SETTINGS_CENTER_LEAVE_EVENT, { cancelable: true, detail: { href: window.location.href } });
    if (!window.dispatchEvent(leave)) { restoreCancelledSettingsNavigation(event); return; }
    remember(current?.position ?? 0);
  };
  history.pushState = trackedPush;
  history.replaceState = trackedReplace;
  window.addEventListener('popstate', pop);
  return () => {
    if (history.pushState === trackedPush) history.pushState = push;
    if (history.replaceState === trackedReplace) history.replaceState = replace;
    window.removeEventListener('popstate', pop);
    current = undefined;
  };
}

export function restoreCancelledSettingsNavigation(event: PopStateEvent) {
  if (!current) return;
  event.stopImmediatePropagation();
  const target = position(event.state);
  const index = nativeIndex();
  const delta = current.nativeIndex !== undefined && index !== undefined ? current.nativeIndex - index
    : target !== undefined ? current.position - target : 0;
  if (delta) window.history.go(delta);
  else window.history.pushState(current.state, '', current.href);
}
