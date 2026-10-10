/**
 * 我的命盘内容
 *
 * 'use client' 标记说明：
 * - 使用 hooks 管理命盘列表、默认值和删除确认
 * - 供统一设置中心复用
 */
'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight, MapPin, Star, Trash2 } from 'lucide-react';
import { useSessionSafe } from '@/components/providers/ClientProviders';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import { useToast } from '@/components/ui/Toast';
import { SettingsLoginRequired } from '@/components/settings/SettingsLoginRequired';
import { useChartMutation, useUserCharts } from '@/lib/hooks/useUserCharts';
import { getNavItemById } from '@/lib/navigation/registry';
import { deleteUserChart, setDefaultUserChart, type UserChartRecord } from '@/lib/user/charts-client';

type ChartType = 'bazi' | 'ziwei';

interface ChartItem {
  id: string;
  type: ChartType;
  name: string;
  gender: 'male' | 'female' | 'unknown';
  birth_date: string;
  birth_time: string | null;
  city: string | null;
  created_at: string;
  is_default: boolean;
}

function formatCharts(rows: UserChartRecord[], type: ChartType, defaultId: string | null): ChartItem[] {
  return rows.map((chart): ChartItem => ({
    ...chart,
    type,
    gender: chart.gender ?? 'unknown',
    city: chart.birth_place,
    is_default: chart.id === defaultId,
  })).sort((a, b) => Number(b.is_default) - Number(a.is_default) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function getGenderLabel(gender: ChartItem['gender']) {
  return gender === 'female' ? '女' : '男';
}

function isModifiedEvent(event: MouseEvent<HTMLElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function SectionTitle({
  type,
  title,
}: {
  type: ChartType;
  title: string;
}) {
  const Icon = getNavItemById(type)?.icon;

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-secondary">
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </span>
        <span>{title}</span>
      </h2>
    </div>
  );
}

function ChartRow({
  chart,
  onDelete,
  onSetDefault,
  onNavigate,
  pending,
}: {
  chart: ChartItem;
  onDelete: (id: string, type: ChartType, event: MouseEvent<HTMLButtonElement>) => void;
  onSetDefault: (id: string, type: ChartType, event: MouseEvent<HTMLButtonElement>) => void;
  pending: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const href = chart.type === 'bazi' ? `/bazi/result?chart=${chart.id}` : `/ziwei/result?chart=${chart.id}`;

  return (
    <Link
      href={href}
      onClick={(event) => onNavigate?.(event, href)}
      className="group relative flex items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-3 transition-colors duration-150 hover:bg-background-secondary active:bg-background-tertiary dark:hover:bg-background-secondary dark:active:bg-background-tertiary"
    >
      <div className="absolute left-[6px] top-1/2 -translate-y-1/2 select-none text-foreground/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        ⋮⋮
      </div>

      <div className="min-w-0 flex-1 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{chart.name}</h3>
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-foreground-secondary">
            {getGenderLabel(chart.gender)}
          </span>
          {chart.is_default ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-warning/20 bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold text-[#9a7300]">
              <Star className="h-3 w-3 fill-current" />
              默认
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-foreground-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(chart.birth_date).toLocaleDateString('zh-CN')} {chart.birth_time || ''}
          </span>
          {chart.city ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {chart.city}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!chart.is_default ? (
          <button
            type="button"
            disabled={pending}
            onClick={(event) => onSetDefault(chart.id, chart.type, event)}
            className="rounded-md p-2 text-foreground-secondary transition-colors duration-150 hover:bg-background-secondary hover:text-warning"
            title="设为默认"
          >
            <Star className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={(event) => onDelete(chart.id, chart.type, event)}
          className="rounded-md p-2 text-foreground-secondary transition-colors duration-150 hover:bg-background-secondary hover:text-danger"
          title="删除命盘"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <ChevronRight className="h-4 w-4 text-foreground-secondary" />
      </div>
    </Link>
  );
}

function ChartSection({
  title,
  list,
  type,
  onDelete,
  onSetDefault,
  onNavigate,
  pending,
}: {
  title: string;
  list: ChartItem[];
  type: ChartType;
  onDelete: (id: string, type: ChartType, event: MouseEvent<HTMLButtonElement>) => void;
  onSetDefault: (id: string, type: ChartType, event: MouseEvent<HTMLButtonElement>) => void;
  pending: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <section className="space-y-3">
      <SectionTitle type={type} title={title} />

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((chart) => (
            <ChartRow
              key={`${chart.type}-${chart.id}`}
              chart={chart}
              onDelete={onDelete}
              onSetDefault={onSetDefault}
              onNavigate={onNavigate}
              pending={pending}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center">
          <p className="text-sm text-foreground-secondary">暂无{title}</p>
        </div>
      )}
    </section>
  );
}

export default function ChartsPanel() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSessionSafe();
  const { showToast } = useToast();
  const userId = user?.id;
  const chartsQuery = useUserCharts(userId, { enabled: !sessionLoading });
  const { pending, run } = useChartMutation(userId);
  const baziCharts = useMemo(() => formatCharts(chartsQuery.data?.baziCharts ?? [], 'bazi', chartsQuery.data?.defaultChartIds.bazi ?? null), [chartsQuery.data]);
  const ziweiCharts = useMemo(() => formatCharts(chartsQuery.data?.ziweiCharts ?? [], 'ziwei', chartsQuery.data?.defaultChartIds.ziwei ?? null), [chartsQuery.data]);
  const [pendingDelete, setPendingDelete] = useState<{ userId: string; id: string; type: ChartType } | null>(null);
  const currentDelete = pendingDelete?.userId === userId ? pendingDelete : null;

  useEffect(() => {
    if (chartsQuery.error) showToast('error', '加载命盘失败');
  }, [chartsQuery.error, showToast]);

  const handleNavigate = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) return;

    event.preventDefault();

    router.push(href);
  }, [router]);

  const handleDelete = (id: string, type: ChartType) => run(
    scope => deleteUserChart(type, id, scope),
    () => {
      setPendingDelete(null);
      showToast('success', '命盘已删除');
    },
    () => showToast('error', '删除命盘失败'),
  );

  const handleSetDefault = (id: string, type: ChartType, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void run(
      scope => setDefaultUserChart(type, id, scope),
      () => showToast('success', '默认命盘已更新'),
      () => showToast('error', '设置默认命盘失败'),
    );
  };

  if (chartsQuery.isLoading || sessionLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-background">
        <SoundWaveLoader variant="inline" />
      </div>
    );
  }

  if (!user) {
    return <SettingsLoginRequired title="请先登录后管理命盘" />;
  }

  return (
    <div className="space-y-8">
      {chartsQuery.error ? (
        <div role="alert" className="text-sm text-foreground-secondary">
          加载命盘失败，已显示的命盘未改变。
          <button type="button" className="ml-2 text-accent" onClick={() => { void chartsQuery.refetch(); }}>重试</button>
        </div>
      ) : null}

      <ChartSection
        title="八字命盘"
        list={baziCharts}
        type="bazi"
        onDelete={(id, type, event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) setPendingDelete({ userId: user.id, id, type });
        }}
        onSetDefault={handleSetDefault}
        onNavigate={handleNavigate}
        pending={pending}
      />

      <ChartSection
        title="紫微命盘"
        list={ziweiCharts}
        type="ziwei"
        onDelete={(id, type, event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) setPendingDelete({ userId: user.id, id, type });
        }}
        onSetDefault={handleSetDefault}
        onNavigate={handleNavigate}
        pending={pending}
      />

      <ConfirmDialog
        isOpen={!!currentDelete}
        loading={pending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => currentDelete ? handleDelete(currentDelete.id, currentDelete.type) : undefined}
        title="确认删除"
        description="确定要删除这个命盘吗？此操作无法撤销。"
        confirmText="确认删除"
        variant="danger"
      />
    </div>
  );
}
