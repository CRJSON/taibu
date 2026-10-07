'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  LockKeyhole,
  X,
} from 'lucide-react';
import { useFeatureToggles } from '@/lib/hooks/useFeatureToggles';
import { useSessionSafe } from '@/components/providers/ClientProviders';
import { useCurrentUserProfile } from '@/lib/hooks/useCurrentUserProfile';
import { useActiveSettingsCenterTab } from '@/lib/hooks/useSettingsCenterRouteState';
import {
  closeSettingsCenter,
  getSettingsCenterDisabledState,
  getSettingsCenterTabs,
  isAdminSettingsCenterTab,
  openSettingsCenter,
  type SettingsCenterFlags,
  type SettingsCenterTab,
} from '@/lib/settings-center';
import { SettingsLoginRequired } from '@/components/settings/SettingsLoginRequired';
import {
  SETTINGS_CENTER_ICON_SIZES,
  SETTINGS_CENTER_TAB_ICONS,
  type SettingsCenterIconProps,
} from '@/components/settings/settings-center-icons';

const LazyGeneralSettingsContent = lazy(() => import('@/components/settings/panels/GeneralSettingsPanel'));
const LazyUpgradeContent = lazy(() => import('@/components/settings/panels/UpgradePanel'));
const LazyAISettingsContent = lazy(() => import('@/components/settings/panels/AISettingsPanel'));
const LazyBYOKContent = lazy(() => import('@/components/settings/panels/BYOKPanel'));
const LazyChartsContent = lazy(() => import('@/components/settings/panels/ChartsPanel'));
const LazyKnowledgeBaseManageContent = lazy(() => import('@/components/settings/panels/KnowledgeBasePanel'));
const LazyMcpPageContent = lazy(() => import('@/components/settings/panels/McpServicePanel'));
const LazyProfileContent = lazy(() => import('@/components/settings/panels/ProfilePanel'));
const LazyHelpContent = lazy(() => import('@/components/settings/panels/HelpPanel'));
const LazyAdminAnnouncementsContent = lazy(async () => ({
  default: (await import('@/components/settings/AccountAdminPanels')).AdminAnnouncementsContent,
}));
const LazyAdminFeaturesContent = lazy(async () => ({
  default: (await import('@/components/settings/AccountAdminPanels')).AdminFeaturesContent,
}));
const LazyAdminAIServicesContent = lazy(async () => ({
  default: (await import('@/components/settings/AccountAdminPanels')).AdminAIServicesContent,
}));

export type SettingsCenterTabItem = {
  id: SettingsCenterTab;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string; size?: number | string }>;
  disabled: boolean;
};

function SettingsPanelFallback() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-background">
      <div className="text-sm text-foreground-secondary">加载中...</div>
    </div>
  );
}

function SettingsTabDisabledState({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<SettingsCenterIconProps>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/60">
          <Icon size={SETTINGS_CENTER_ICON_SIZES.disabled} className="shrink-0" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-foreground-secondary">{description}</p>
        </div>
      </div>
    </div>
  );
}

function AdminPermissionRequiredState({ loggedIn }: { loggedIn: boolean }) {
  if (!loggedIn) {
    return <SettingsLoginRequired title="请先登录后使用管理功能" description="登录后系统会自动识别管理员账号。" />;
  }

  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-sm font-semibold text-foreground">无权限访问</h2>
      <p className="mt-1 text-sm text-foreground-secondary">当前账号不在管理员名单中，无法查看该管理面板。</p>
    </div>
  );
}

function AdminStateErrorState() {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-sm font-semibold text-foreground">管理员状态加载失败</h2>
      <p className="mt-1 text-sm text-foreground-secondary">暂时无法确认当前账号的管理员权限，请稍后重试。</p>
    </div>
  );
}

function isAdminTab(tab: SettingsCenterTab) {
  return isAdminSettingsCenterTab(tab);
}

function renderLazyPanel(node: ReactElement) {
  return (
    <Suspense fallback={<SettingsPanelFallback />}>
      {node}
    </Suspense>
  );
}

function renderSettingsCenterPanel(
  tab: SettingsCenterTab,
  flags: SettingsCenterFlags,
  options: {
    isLoggedIn: boolean;
    isAdmin: boolean;
    profileLoading: boolean;
    profileError: boolean;
  },
): ReactElement {
  if (isAdminTab(tab)) {
    if (options.profileLoading) {
      return <SettingsPanelFallback />;
    }
    if (options.profileError) {
      return <AdminStateErrorState />;
    }
    if (!options.isLoggedIn || !options.isAdmin) {
      return <AdminPermissionRequiredState loggedIn={options.isLoggedIn} />;
    }
  }

  const disabledState = getSettingsCenterDisabledState(tab, flags);
  if (disabledState) {
    return (
        <SettingsTabDisabledState
        icon={SETTINGS_CENTER_TAB_ICONS[tab]}
        title={disabledState.title}
        description={disabledState.description}
      />
    );
  }

  switch (tab) {
    case 'profile':
      return renderLazyPanel(<LazyProfileContent />);
    case 'general':
      return renderLazyPanel(<LazyGeneralSettingsContent />);
    case 'upgrade':
      return renderLazyPanel(<LazyUpgradeContent />);
    case 'personalization':
      return renderLazyPanel(<LazyAISettingsContent />);
    case 'byok':
      return renderLazyPanel(<LazyBYOKContent />);
    case 'help':
      return renderLazyPanel(<LazyHelpContent />);
    case 'charts':
      return renderLazyPanel(<LazyChartsContent />);
    case 'knowledge-base':
      return renderLazyPanel(<LazyKnowledgeBaseManageContent />);
    case 'mcp-service':
      return renderLazyPanel(<LazyMcpPageContent />);
    case 'admin-announcements':
      return renderLazyPanel(<LazyAdminAnnouncementsContent />);
    case 'admin-features':
      return renderLazyPanel(<LazyAdminFeaturesContent />);
    case 'admin-ai-services':
      return renderLazyPanel(<LazyAdminAIServicesContent />);
  }
}

export function SettingsCenterHost() {
  const activeTab = useActiveSettingsCenterTab();
  const { isFeatureEnabled, loaded: featureTogglesLoaded } = useFeatureToggles();
  const { user } = useSessionSafe();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { profile, loading: profileLoading, error: profileError } = useCurrentUserProfile({ enabled: !!activeTab });
  const isAdmin = !!profile?.is_admin;
  const setActiveTab = useCallback((tab: SettingsCenterTab) => {
    openSettingsCenter(tab, { replace: true });
  }, []);

  const flags = useMemo<SettingsCenterFlags>(
    () => ({
      upgradeEnabled: !featureTogglesLoaded || isFeatureEnabled('upgrade'),
      chartsEnabled: !featureTogglesLoaded || isFeatureEnabled('charts'),
      knowledgeBaseEnabled: !featureTogglesLoaded || isFeatureEnabled('knowledge-base'),
      mcpServiceEnabled: !featureTogglesLoaded || isFeatureEnabled('mcp-service'),
      personalizationEnabled: featureTogglesLoaded
        && isFeatureEnabled('chat')
        && isFeatureEnabled('ai-personalization'),
      helpEnabled: !featureTogglesLoaded || isFeatureEnabled('help'),
      isAdmin,
    }),
    [featureTogglesLoaded, isAdmin, isFeatureEnabled],
  );

  const tabs = useMemo<SettingsCenterTabItem[]>(
    () => getSettingsCenterTabs(flags).map((tab) => ({ ...tab, icon: SETTINGS_CENTER_TAB_ICONS[tab.id] })),
    [flags],
  );
  const activeTabState = tabs.find((tab) => tab.id === activeTab) ?? null;
  const shouldFallbackToGeneral = !!activeTabState && activeTabState.disabled && activeTabState.id !== 'general';
  const resolvedActiveTab = shouldFallbackToGeneral ? 'general' : activeTab;
  const [mountedTabs, setMountedTabs] = useState<SettingsCenterTab[]>([]);
  const renderedTabs = mountedTabs.length > 0
    ? mountedTabs
    : resolvedActiveTab
      ? [resolvedActiveTab]
      : [];

  useEffect(() => {
    if (!mounted || !shouldFallbackToGeneral) return;
    openSettingsCenter('general', { replace: true });
  }, [mounted, shouldFallbackToGeneral]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!resolvedActiveTab) {
        return;
      }

      setMountedTabs((current) => (
        current.includes(resolvedActiveTab) ? current : [...current, resolvedActiveTab]
      ));
    });
  }, [resolvedActiveTab]);

  if (!mounted) {
    return null;
  }

  const displayTab = resolvedActiveTab ?? renderedTabs.at(-1) ?? 'general';
  const activeTabLabel = tabs.find((tab) => tab.id === displayTab)?.label ?? '设置';

  return (
    <Modal open={Boolean(activeTab)} onClose={() => closeSettingsCenter()} labelledBy="settings-center-heading" className="settings-center-dialog" keepMounted>
        <h2 id="settings-center-heading" className="sr-only">设置中心</h2>
        <div
          className="flex h-full w-full overflow-hidden bg-background text-foreground"
        >
          <aside className="hidden w-46 flex-shrink-0 border-r border-border bg-[#f7f6f3] p-2 dark:bg-background md:flex md:flex-col">
            <div className="mb-4 flex items-center justify-between px-2 py-1">
              <h2 className="text-base font-semibold">设置</h2>
              <button
                type="button"
                onClick={() => closeSettingsCenter()}
                className="rounded-md border border-transparent p-1.5 text-foreground-secondary transition-colors duration-150 hover:bg-[#efedea] hover:text-foreground dark:hover:bg-background-secondary dark:hover:text-foreground"
                aria-label="关闭设置中心"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.id === resolvedActiveTab;
                const isDisabled = tab.disabled;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    disabled={tab.disabled}
                    aria-disabled={tab.disabled}
                    aria-pressed={isActive}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
                      isDisabled
                        ? 'cursor-not-allowed border border-border bg-background-secondary/70 text-foreground/45 dark:text-foreground/50'
                        : isActive
                        ? 'bg-[#e3e1db] text-[#37352f] dark:bg-background-tertiary dark:text-foreground'
                        : 'bg-transparent text-foreground-secondary hover:bg-[#efedea] dark:hover:bg-background-secondary'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={SETTINGS_CENTER_ICON_SIZES.sidebar} className="shrink-0" />
                      <span>{tab.label}</span>
                    </span>
                    {tab.disabled ? (
                      <LockKeyhole className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col bg-[#f7f6f3] dark:bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
              <h2 className="text-sm font-semibold">{activeTabLabel}</h2>
              <button
                type="button"
                onClick={() => closeSettingsCenter()}
                className="rounded-md border border-transparent p-1.5 text-foreground-secondary transition-colors duration-150 hover:bg-[#efedea] hover:text-foreground dark:hover:bg-background-secondary dark:hover:text-foreground"
                aria-label="关闭设置中心"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border px-4 py-3 md:hidden">
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-2">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === resolvedActiveTab;
                    const isDisabled = tab.disabled;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        disabled={tab.disabled}
                        aria-disabled={tab.disabled}
                        aria-pressed={isActive}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          isDisabled
                            ? 'cursor-not-allowed border-border bg-background-secondary/70 text-foreground/45 dark:text-foreground/50'
                            : isActive
                            ? 'border-[#37352f]/10 bg-[#e3e1db] text-[#37352f] dark:border-white/10 dark:bg-background-tertiary dark:text-foreground'
                            : 'border-border bg-background text-foreground-secondary'
                        }`}
                      >
                        <Icon size={SETTINGS_CENTER_ICON_SIZES.mobile} className="shrink-0" />
                        <span>{tab.label}</span>
                        {tab.disabled ? <LockKeyhole className="h-3 w-3 shrink-0 opacity-80" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
              {renderedTabs.map((tab) => (
                <div
                  key={`${user?.id ?? "visitor"}:${tab}`}
                  className={tab === resolvedActiveTab ? 'block' : 'hidden'}
                  aria-hidden={tab === resolvedActiveTab ? undefined : true}
                  inert={tab !== resolvedActiveTab}
                >
                  {renderSettingsCenterPanel(tab, flags, {
                    isLoggedIn: !!user,
                    isAdmin,
                    profileLoading,
                    profileError: !!profileError,
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
    </Modal>
  );
}
