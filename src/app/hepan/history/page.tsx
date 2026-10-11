/**
 * 合盘历史记录页面 - 使用 HistoryPageTemplate
 *
 * 'use client'：卡片交互（查看 / 删除 / 加入知识库）在客户端处理
 */
'use client';

import { Heart, Briefcase, Users, Clock } from 'lucide-react';
import { HistoryPageTemplate, type CardActions } from '@/components/history/HistoryPageTemplate';
import type { HistorySummaryItem } from '@/lib/history/registry';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Heart }> = {
    love: { label: '情侣合盘', icon: Heart },
    business: { label: '商业合伙', icon: Briefcase },
    family: { label: '亲子关系', icon: Users },
};

function HepanCard({ item, actions }: { item: HistorySummaryItem; actions: CardActions }) {
    const chartType = item.subType === 'business' || item.subType === 'family' ? item.subType : 'love';
    const config = TYPE_CONFIG[chartType];
    const Icon = config.icon;
    const [person1Name = item.title, person2Name = ''] = (item.question || '')
        .split(/\s*&\s*/u).map(s => s.trim()).filter(Boolean);

    return (
        <div
            className="group relative cursor-pointer rounded-2xl border-[0.5px] border-border bg-surface p-4 transition-colors duration-150 hover:border-border-hover hover:bg-background-secondary sm:p-5"
            onClick={actions.onView}
        >
            <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-3">
                        <h3 className="flex min-w-0 items-center gap-2 truncate font-display text-lg text-foreground">
                            {person1Name}<span className="text-sm text-foreground-tertiary">&</span>{person2Name}
                        </h3>
                        <span className="shrink-0 rounded-md bg-background-secondary px-2 py-0.5 text-xs text-foreground-secondary">{item.title || config.label}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t-[0.5px] border-border pt-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex items-center gap-1.5 text-xs text-foreground-tertiary"><Clock className="h-3.5 w-3.5" />{actions.formatDate(item.createdAt)}</span>
                            {item.modelName && <span className="truncate rounded-md bg-background-secondary px-2 py-0.5 text-xs text-foreground-secondary">{item.modelName}</span>}
                        </div>
                        {item.metric && (
                            <div className="flex shrink-0 items-baseline gap-1.5">
                                <span className="text-xs text-foreground-secondary">契合度</span>
                                <span className="font-display text-lg text-accent-strong">{item.metric}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    {actions.canAddToKnowledgeBase && (
                        <button type="button" onClick={e => { e.stopPropagation(); actions.onAddToKb(); }}
                            className="rounded-lg p-2 text-foreground-tertiary transition-colors hover:bg-success/10 hover:text-success" title="加入知识库" aria-label="加入知识库">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        </button>
                    )}
                    <button type="button" onClick={e => { e.stopPropagation(); actions.onDelete(); }}
                        className="rounded-lg p-2 text-foreground-tertiary transition-colors hover:bg-danger/10 hover:text-danger" title="删除" aria-label="删除">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function HepanHistoryPage() {
    return (
        <HistoryPageTemplate
            sourceType="hepan"
            title="合盘分析历史"
            subtitle="查看您的历史合盘记录"
            layout="list"
            searchPlaceholder="搜索姓名或类型..."
            emptyActionLabel="开始分析"
            deleteMessage="确定要删除这条合盘记录吗？此操作无法撤销。"
            kbSourceType="hepan_chart"
            themeColor="accent"
            invalidateTypes={['hepan_chart']}
            kbTitleFn={item => item.question || item.title}
            renderCard={(item, actions) => <HepanCard item={item} actions={actions} />}
        />
    );
}
