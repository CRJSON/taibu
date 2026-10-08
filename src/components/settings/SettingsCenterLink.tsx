'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import Link from 'next/link';
import { getSettingsCenterRouteTarget, type SettingsCenterTab } from '@/lib/settings-center';

interface SettingsCenterLinkProps {
  tab: SettingsCenterTab;
  className?: string;
  children: ReactNode;
  title?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function SettingsCenterLink({
  tab,
  className,
  children,
  title,
  onClick,
}: SettingsCenterLinkProps) {
  return (
    <Link
      href={getSettingsCenterRouteTarget(tab)}
      className={className}
      title={title}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
