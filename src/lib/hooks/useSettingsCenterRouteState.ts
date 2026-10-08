'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import {
  readSettingsCenterSubpathFromWindow,
  readSettingsCenterTabFromWindow,
  subscribeSettingsCenterLocation,
  parseSettingsCenterPath,
} from '@/lib/settings-center';

export function useActiveSettingsCenterTab() {
  const pathname = usePathname();
  const legacyTab = useSyncExternalStore(
    subscribeSettingsCenterLocation,
    readSettingsCenterTabFromWindow,
    () => null,
  );
  return parseSettingsCenterPath(pathname)?.tab ?? legacyTab;
}

export function useSettingsCenterSubpath() {
  const pathname = usePathname();
  const legacySubpath = useSyncExternalStore(
    subscribeSettingsCenterLocation,
    readSettingsCenterSubpathFromWindow,
    () => null,
  );
  const route = parseSettingsCenterPath(pathname);
  return route ? route.subpath : legacySubpath;
}
