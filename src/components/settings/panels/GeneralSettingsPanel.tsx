/**
 * 用户设置页面内容
 *
 * 'use client' 标记说明：
 * - 使用 hooks 管理用户设置加载与保存
 * - 该模块供统一设置中心复用
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@/components/ui/ThemeProvider';
import { useSessionSafe } from '@/components/providers/ClientProviders';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import { SegmentedChoice } from '@/components/settings/SegmentedChoice';
import { SettingsLoginRequired } from '@/components/settings/SettingsLoginRequired';
import { loadReminderSubscriptions, type ReminderType, updateReminderSubscriptionClient } from '@/lib/reminders-client';
import { mutationEffects } from '@/lib/query/invalidation';
import { getCurrentUserSettings, updateCurrentUserSettings } from '@/lib/user/settings';
import { FONT_SCALES, type FontScale } from '@/lib/chat/preferences';
import { BriefingSettings } from '../BriefingSettings';
import { DEFAULT_BRIEFING_PREFERENCES, initialBriefingPreferences, type BriefingPreferences } from '@/lib/briefing-preferences';

interface Settings {
  notifications: boolean;
  language: 'zh' | 'en';
  briefingPreferences: BriefingPreferences;
}

type ReminderSettings = Record<ReminderType, boolean>;

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  solar_term: false,
  fortune: false,
  key_date: false,
  daily_briefing: false,
};

const REMINDER_ITEMS: Array<{
  type: ReminderType;
  label: string;
}> = [
  {
    type: 'solar_term',
    label: '节气提醒',
  },
  {
    type: 'fortune',
    label: '运势提醒',
  },
  {
    type: 'key_date',
    label: '关键日提醒',
  },
];

const THEME_MODE_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '自动' },
] as const;

function SectionTitle({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-foreground-secondary">
      <span>{children}</span>
    </h2>
  );
}

function Row({
  title,
  control,
}: {
  title: string;
  control: ReactNode;
}) {
  return (
    <div className="settings-preference-row flex items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      {control}
    </div>
  );
}

function PreferenceSwitch({
  checked,
  onToggle,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-150 ${
        checked
          ? 'bg-accent'
          : 'bg-background-secondary dark:bg-background-tertiary'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function GeneralSettingsPanel() {
  const { user } = useSessionSafe();
  return <AccountGeneralSettingsPanel key={user?.id ?? 'visitor'} />;
}

function AccountGeneralSettingsPanel() {
  const { themeMode, setThemeMode, fontScale, setFontScale } = useTheme();
  const { user, loading: sessionLoading } = useSessionSafe();
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [desktopError, setDesktopError] = useState('');
  const [settings, setSettings] = useState<Settings>({
    notifications: true,
    language: 'zh',
    briefingPreferences: DEFAULT_BRIEFING_PREFERENCES,
  });
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [reminderLoadError, setReminderLoadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const operations = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [initializedForUserId, setInitializedForUserId] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (sessionLoading) return;
    if (!userId) {
      setLoading(false);
      setRemindersLoading(false);
      setReminderLoadError(null);
      setLoadError(null);
      return;
    }

    lifecycle.current?.abort();
    const controller = new AbortController();
    lifecycle.current = controller;
    const scope = { expectedUserId: userId, signal: controller.signal };
    setLoading(true);
    setRemindersLoading(true);

    try {
      const [settingsResult, remindersResult] = await Promise.allSettled([
        getCurrentUserSettings(scope),
        loadReminderSubscriptions(scope),
      ]);

      if (controller.signal.aborted) return;
      if (settingsResult.status === 'rejected') {
        setLoadError('加载偏好设置失败');
        return;
      }

      if (settingsResult.value.error) {
        setLoadError(settingsResult.value.error.message || '加载偏好设置失败');
        return;
      }

      setLoadError(null);
      let browserTimezone: string | undefined;
      try { browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* Shanghai fallback */ }
      setSettings({
        notifications: settingsResult.value.settings?.notificationsEnabled ?? true,
        language: settingsResult.value.settings?.language ?? 'zh',
        briefingPreferences: initialBriefingPreferences(settingsResult.value.settings?.briefingPreferences, settingsResult.value.settings?.briefingConfigured ?? false, browserTimezone),
      });
      setDesktopNotifications(settingsResult.value.settings?.chatPreferences?.desktopNotifications ?? false);

      if (remindersResult.status === 'fulfilled') {
        if (remindersResult.value.ok) {
          setReminderLoadError(null);
          setReminders(
            remindersResult.value.subscriptions.reduce<ReminderSettings>((acc, item) => {
              acc[item.reminderType] = item.enabled;
              return acc;
            }, { ...DEFAULT_REMINDER_SETTINGS }),
          );
        } else {
          setReminderLoadError(remindersResult.value.error.message || '加载提醒状态失败');
          setReminders({ ...DEFAULT_REMINDER_SETTINGS });
        }
      } else {
        console.error('加载提醒状态失败:', remindersResult.reason);
        setReminderLoadError(
          remindersResult.reason instanceof Error
            ? remindersResult.reason.message
            : '加载提醒状态失败',
        );
        setReminders({ ...DEFAULT_REMINDER_SETTINGS });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('加载用户设置失败:', error);
      setLoadError('加载偏好设置失败');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRemindersLoading(false);
      }
    }
  }, [sessionLoading, userId]);

  useEffect(() => {
    if (sessionLoading) return;
    if (initializedForUserId === userId) return;

    setInitializedForUserId(userId);
    void load();
  }, [initializedForUserId, load, sessionLoading, userId]);

  useEffect(() => () => lifecycle.current?.abort(), []);

  const beginOperation = (key: string) => {
    if (operations.current.has(key)) return false;
    operations.current.add(key);
    setPending(new Set(operations.current));
    return true;
  };
  const finishOperation = (key: string) => {
    operations.current.delete(key);
    setPending(new Set(operations.current));
  };

  const updateSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const controller = lifecycle.current;
    if (!userId || loadError || loading || !controller || controller.signal.aborted || !beginOperation(key)) return;
    const previousValue = settings[key];
    setSettings(current => ({ ...current, [key]: value }));

    const saved = await updateCurrentUserSettings(
      key === 'notifications'
        ? { notificationsEnabled: value as boolean }
        : { language: value as Settings['language'] },
      mutationEffects.userSettings(userId),
      { expectedUserId: userId, signal: controller.signal },
    ).catch(() => null);
    if (controller.signal.aborted) return;
    finishOperation(key);

    if (!saved) {
      console.error('更新偏好设置失败');
      setSettings(current => ({ ...current, [key]: previousValue }));
    }
  };

  const updateReminderSetting = async (type: ReminderType) => {
    const controller = lifecycle.current;
    if (!userId || loadError || loading || !controller || controller.signal.aborted || !beginOperation(type)) return;

    const previousEnabled = reminders[type];
    const nextEnabled = !previousEnabled;
    setReminders((prev) => ({ ...prev, [type]: nextEnabled }));

    try {
      const result = await updateReminderSubscriptionClient({
        reminderType: type,
        enabled: nextEnabled,
        notifySite: true,
      }, { expectedUserId: userId, signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!result.ok) {
        throw new Error(result.error.message || '更新提醒状态失败');
      }
      setReminderLoadError(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('更新提醒状态失败:', error);
      setReminders((prev) => ({ ...prev, [type]: previousEnabled }));
    } finally {
      if (!controller.signal.aborted) finishOperation(type);
    }
  };

  if (loading || sessionLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-background">
        <SoundWaveLoader variant="inline" />
      </div>
    );
  }

  if (!user) {
    return <SettingsLoginRequired />;
  }

  return (
    <div className="space-y-8">
      {loadError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {loadError}
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>基础偏好</SectionTitle>
        <div className="space-y-2">
          <Row title="网页打开时桌面提醒" control={<button type="button" className="text-xs px-3 py-2 border border-border rounded" onClick={async () => {
            setDesktopError('');
            if (!desktopNotifications) {
              if (!('Notification' in window)) { setDesktopError('此浏览器不支持桌面提醒'); return; }
              const permission = await window.Notification.requestPermission();
              if (permission !== 'granted') { setDesktopError('桌面提醒需要在浏览器中允许通知'); return; }
            }
            const current = await getCurrentUserSettings({ expectedUserId: userId! });
            if (current.settings && await updateCurrentUserSettings({ chatPreferences: { ...current.settings.chatPreferences, desktopNotifications: !desktopNotifications } }, mutationEffects.userSettings(userId!), { expectedUserId: userId! })) setDesktopNotifications(!desktopNotifications);
            else setDesktopError('保存桌面提醒偏好失败');
          }}>{desktopNotifications ? '关闭桌面提醒' : '开启桌面提醒'}</button>} />
          {desktopError && <p role="alert" className="text-sm text-foreground-secondary">{desktopError}</p>}
          <Row
            title="外观界面"
            control={(
              <SegmentedChoice
                ariaLabel="外观界面"
                value={themeMode}
                onChange={setThemeMode}
                options={THEME_MODE_OPTIONS}
              />
            )}
          />

          <Row
            title="语言设置"
            control={(
              <select
                value={settings.language}
                onChange={(event) => updateSetting('language', event.target.value as 'zh' | 'en')}
                disabled={Boolean(loadError) || pending.has('language')}
                className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors duration-150 focus:ring-2 focus:ring-accent/30"
              >
                <option value="zh">简体中文</option>
                <option value="en" disabled>English (即将上线)</option>
              </select>
            )}
          />
          <Row title="全站字号" control={<select aria-label="全站字号" value={fontScale} onChange={event => {
            const scale = Number(event.target.value) as FontScale;
            setFontScale(scale);
            void getCurrentUserSettings({ expectedUserId: userId! }).then(current => current.settings && updateCurrentUserSettings({ chatPreferences: { ...current.settings.chatPreferences, fontScale: scale } }, mutationEffects.userSettings(userId!), { expectedUserId: userId! }));
          }} className="rounded-md border border-border bg-background px-3 py-2 text-sm">{FONT_SCALES.map(scale => <option key={scale} value={scale}>{scale}%</option>)}</select>} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>通知与提醒</SectionTitle>
        {reminderLoadError ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <span className="min-w-0 flex-1">{reminderLoadError}</span>
            <button
              type="button"
              disabled={pending.size > 0}
              onClick={() => void load()}
              className="shrink-0 rounded-md px-2 py-1 font-medium transition-colors hover:bg-amber-100"
            >
              重试
            </button>
          </div>
        ) : null}
        <div className="space-y-2">
          <Row
            title="推送通知"
            control={(
              <PreferenceSwitch
                checked={settings.notifications}
                onToggle={() => updateSetting('notifications', !settings.notifications)}
                disabled={Boolean(loadError) || pending.has('notifications')}
              />
            )}
          />

          {REMINDER_ITEMS.map((item) => {
            return (
              <Row
                key={item.type}
                title={item.label}
                control={(
                  <PreferenceSwitch
                    checked={reminders[item.type]}
                    onToggle={() => updateReminderSetting(item.type)}
                    disabled={Boolean(loadError) || Boolean(reminderLoadError) || remindersLoading || pending.has(item.type)}
                  />
                )}
              />
            );
          })}
        </div>
      </section>
      {!loading && !loadError && <BriefingSettings key={user.id} userId={user.id} initialPreferences={settings.briefingPreferences} initialEnabled={reminders.daily_briefing} />}
    </div>
  );
}
