'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSettingsCenterRouteTarget, parseSettingsCenterHash, parseSettingsCenterHashSubpath, SETTINGS_CENTER_LEAVE_EVENT, SETTINGS_CENTER_NAVIGATE_EVENT } from '@/lib/settings-center';
import { installSettingsHistoryTracking } from '@/lib/settings-navigation';

/** Preserve legacy bookmarks and imperative callers while routing to real pages. */
export function SettingsCenterHost() {
  const router = useRouter();
  useEffect(() => {
    const stopTracking = installSettingsHistoryTracking();
    const legacy = () => {
      const tab = parseSettingsCenterHash(window.location.hash);
      if (tab) router.replace(getSettingsCenterRouteTarget(tab, { subpath: parseSettingsCenterHashSubpath(window.location.hash), search: window.location.search }));
    };
    const navigate = (event: Event) => {
      const { href, replace } = (event as CustomEvent<{ href?: string; replace?: boolean }>).detail ?? {};
      if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return;
      const leave = new CustomEvent(SETTINGS_CENTER_LEAVE_EVENT, { cancelable: true, detail: { href } });
      if (!window.dispatchEvent(leave)) return;
      if (replace) router.replace(href); else router.push(href);
    };
    legacy();
    window.addEventListener('hashchange', legacy);
    window.addEventListener(SETTINGS_CENTER_NAVIGATE_EVENT, navigate);
    return () => { stopTracking(); window.removeEventListener('hashchange', legacy); window.removeEventListener(SETTINGS_CENTER_NAVIGATE_EVENT, navigate); };
  }, [router]);
  return null;
}
