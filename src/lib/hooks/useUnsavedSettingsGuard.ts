'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SETTINGS_CENTER_LEAVE_EVENT } from '@/lib/settings-center';

const warning = '设置中有尚未保存的修改。离开将放弃这些修改，确定离开吗？';
const inSettings = (pathname: string) => pathname === '/settings' || pathname.startsWith('/settings/');
const dirtyForms = new Set<symbol>();
let removeListeners: (() => void) | undefined;

function installGuard() {
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && inSettings(url.pathname)) return;
      if (!window.confirm(warning)) { event.preventDefault(); event.stopPropagation(); }
    };
    const navigate = (event: Event) => {
      const href = (event as CustomEvent<{ href: string }>).detail?.href;
      if (href && !inSettings(new URL(href, window.location.href).pathname) && !window.confirm(warning)) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    window.addEventListener(SETTINGS_CENTER_LEAVE_EVENT, navigate);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      window.removeEventListener(SETTINGS_CENTER_LEAVE_EVENT, navigate);
    };
}

/** Several mounted drafts share one confirmation when leaving the settings workspace. */
export function useUnsavedSettingsGuard(dirty: boolean) {
  const pathname = usePathname();
  const enabled = inSettings(pathname ?? '');
  useEffect(() => {
    if (!dirty || !enabled) return;
    const id = Symbol('settings-draft');
    dirtyForms.add(id);
    removeListeners ??= installGuard();
    return () => {
      dirtyForms.delete(id);
      if (!dirtyForms.size) { removeListeners?.(); removeListeners = undefined; }
    };
  }, [dirty, enabled]);
}
