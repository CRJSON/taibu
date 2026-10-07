/**
 * 命理记录页面
 *
 * 对齐 Notion 风格：极简布局、柔和边框、列表化展示
 */
'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { Plus, Download } from 'lucide-react';
import { MING_RECORD_SOURCE_TYPE } from '@/lib/data-sources/types';
import {
    deleteRecord,
    getNotesByDate,
    getRecords,
    getRecord,
    MingRecord,
    MingNote,
    RecordCategory,
    toggleRecordPin,
} from '@/lib/records';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import { useToast } from '@/components/ui/Toast';
import { useSessionSafe } from '@/components/providers/ClientProviders';
import { RecordFilters } from '@/components/records/RecordFilters';
import { RecordsList } from '@/components/records/RecordsList';
import {
    RecordFormModal,
    DailyNotes,
    ImportExportModal,
} from '@/components/records/RecordDetail';
import { AddToKnowledgeBaseModal } from '@/components/knowledge-base/AddToKnowledgeBaseModal';
import {
    KNOWLEDGE_BASE_SYNC_EVENT,
} from '@/lib/browser-api';

const PAGE_SIZE = 10;

type ReadScope = {
    identity: string;
    controller: AbortController;
    request: AbortController | null;
};

function SectionError({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void | Promise<void>;
}) {
    return (
        <div className="p-6">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500 space-y-3">
                <p>{message}</p>
                <button
                    type="button"
                    onClick={() => { void onRetry(); }}
                    className="inline-flex rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
                >
                    重试
                </button>
            </div>
        </div>
    );
}

export default function RecordsPage() {
    const [loading, setLoading] = useState(true);
    const [notesLoading, setNotesLoading] = useState(true);
    const [records, setRecords] = useState<MingRecord[]>([]);
    const [notes, setNotes] = useState<MingNote[]>([]);
    const [total, setTotal] = useState(0);
    const [recordsError, setRecordsError] = useState<string | null>(null);
    const [notesError, setNotesError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<RecordCategory | ''>('');
    const [showRecordForm, setShowRecordForm] = useState(false);
    const [editingRecord, setEditingRecord] = useState<MingRecord | null>(null);
    const [showImportExport, setShowImportExport] = useState(false);
    const [kbTargetRecord, setKbTargetRecord] = useState<MingRecord | null>(null);
    const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
    const { showToast } = useToast();
    const { user, loading: sessionLoading } = useSessionSafe();
    const userId = user?.id;
    const accountIdentity = JSON.stringify([userId ?? null, sessionLoading]);
    useEffect(() => {
        if (sessionLoading || !userId) return;
        const recordId = new URLSearchParams(window.location.search).get('id');
        if (!recordId) return;
        const controller = new AbortController();
        void getRecord(recordId, { signal: controller.signal }).then(record => {
            if (controller.signal.aborted) return;
            setEditingRecord(record);
            setShowRecordForm(true);
        }).catch(error => {
            if (!controller.signal.aborted) showToast('error', error instanceof Error ? error.message : '获取记录失败');
        });
        return () => controller.abort();
    }, [sessionLoading, showToast, userId]);
    const recordsIdentity = JSON.stringify([accountIdentity, search, category, page]);
    const recordsLifecycle = useRef<ReadScope | null>(null);
    const notesLifecycle = useRef<ReadScope | null>(null);
    const reloadRecordsRef = useRef<(() => Promise<void>) | null>(null);

    const openAddToKb = useCallback((record: MingRecord) => {
        setKbTargetRecord(record);
    }, []);

    const closeKbModal = useCallback(() => {
        setKbTargetRecord(null);
    }, []);

    // A refresh supersedes every earlier request for this account/filter/page.
    const loadRecords = useCallback(async () => {
        const scope = recordsLifecycle.current;
        if (!scope || scope.identity !== recordsIdentity || scope.controller.signal.aborted || sessionLoading) return;
        scope.request?.abort();
        const request = new AbortController();
        scope.request = request;
        const isCurrent = () => recordsLifecycle.current === scope && !scope.controller.signal.aborted
            && scope.request === request && !request.signal.aborted;
        if (!userId) {
            setRecords([]);
            setTotal(0);
            setRecordsError('请先登录后查看命理记录');
            setLoading(false);
            return;
        }
        setLoading(true);
        setRecordsError(null);
        try {
            const { records: nextRecords, total: nextTotal } = await getRecords(
                { search: search || undefined, category: category || undefined },
                page,
                PAGE_SIZE,
                { signal: request.signal },
            );
            if (!isCurrent()) return;
            const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
            if (page > lastPage) {
                setPage(lastPage);
                return;
            }
            setRecords(nextRecords);
            setTotal(nextTotal);
        } catch (error) {
            if (!isCurrent()) return;
            const message = error instanceof Error ? error.message : '获取记录失败';
            setRecords([]);
            setTotal(0);
            setRecordsError(message);
            showToast('error', message);
        } finally {
            if (isCurrent()) setLoading(false);
        }
    }, [category, page, recordsIdentity, search, sessionLoading, showToast, userId]);

    const loadNotes = useCallback(async () => {
        const scope = notesLifecycle.current;
        if (!scope || scope.identity !== accountIdentity || scope.controller.signal.aborted || sessionLoading) return;
        scope.request?.abort();
        const request = new AbortController();
        scope.request = request;
        const isCurrent = () => notesLifecycle.current === scope && !scope.controller.signal.aborted
            && scope.request === request && !request.signal.aborted;
        if (!userId) {
            setNotes([]);
            setNotesError('请先登录后查看今日小记');
            setNotesLoading(false);
            return;
        }
        setNotesLoading(true);
        setNotesError(null);
        const today = new Date().toISOString().split('T')[0];
        try {
            const nextNotes = await getNotesByDate(today, { signal: request.signal });
            if (!isCurrent()) return;
            setNotes(nextNotes);
        } catch (error) {
            if (!isCurrent()) return;
            const message = error instanceof Error ? error.message : '获取小记失败';
            setNotes([]);
            setNotesError(message);
            showToast('error', message);
        } finally {
            if (isCurrent()) setNotesLoading(false);
        }
    }, [accountIdentity, sessionLoading, showToast, userId]);

    const handleKnowledgeBaseSuccess = useCallback((payload: {
        sourceId: string;
        kbId: string;
    }) => {
        const scope = notesLifecycle.current;
        if (!scope || scope.identity !== accountIdentity || scope.controller.signal.aborted) return;
        setRecords((prev) => prev.map((record) => {
            if (record.id !== payload.sourceId) {
                return record;
            }

            const archivedKbIds = Array.isArray(record.archived_kb_ids)
                ? Array.from(new Set([...record.archived_kb_ids, payload.kbId]))
                : [payload.kbId];
            return {
                ...record,
                is_archived: true,
                archived_kb_ids: archivedKbIds,
            };
        }));
        closeKbModal();
    }, [accountIdentity, closeKbModal]);

    useLayoutEffect(() => {
        const scope: ReadScope = { identity: recordsIdentity, controller: new AbortController(), request: null };
        recordsLifecycle.current = scope;
        reloadRecordsRef.current = loadRecords;
        setRecords([]);
        setTotal(0);
        setRecordsError(null);
        setLoading(true);
        void loadRecords();
        return () => {
            scope.controller.abort();
            scope.request?.abort();
        };
    }, [loadRecords, recordsIdentity]);

    // Notes are independent of search/category/page changes in the records list.
    useLayoutEffect(() => {
        const scope: ReadScope = { identity: accountIdentity, controller: new AbortController(), request: null };
        notesLifecycle.current = scope;
        setNotes([]);
        setNotesError(null);
        setNotesLoading(true);
        setShowRecordForm(false);
        setEditingRecord(null);
        setShowImportExport(false);
        setKbTargetRecord(null);
        setDeleteRecordId(null);
        void loadNotes();
        return () => {
            scope.controller.abort();
            scope.request?.abort();
        };
    }, [accountIdentity, loadNotes]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handleArchiveChanged = (event: Event) => {
            const detail = (event as CustomEvent<{
                pathname?: string;
                requestBody?: Record<string, unknown> | null;
                responseData?: Record<string, unknown> | null;
            }>).detail;
            const sourceType = detail?.pathname?.startsWith('/api/knowledge-base/ingest')
                ? detail.requestBody?.sourceType
                : detail?.responseData?.sourceType;
            if (sourceType !== 'record' && sourceType !== 'ming_record') {
                return;
            }
            void loadRecords();
        };

        window.addEventListener(KNOWLEDGE_BASE_SYNC_EVENT, handleArchiveChanged as EventListener);
        return () => {
            window.removeEventListener(KNOWLEDGE_BASE_SYNC_EVENT, handleArchiveChanged as EventListener);
        };
    }, [loadRecords]);

    const handleDelete = async (id: string) => {
        const scope = notesLifecycle.current;
        if (!scope || scope.identity !== accountIdentity || scope.controller.signal.aborted || !userId) return;
        const isCurrent = () => notesLifecycle.current === scope && !scope.controller.signal.aborted;
        try {
            await deleteRecord(id, { signal: scope.controller.signal });
            if (!isCurrent()) return;
            setDeleteRecordId(null);
            // Refresh the current filters, even if they changed while the mutation was pending.
            // The returned total, not a captured total-minus-one, determines the last page.
            await reloadRecordsRef.current?.();
        } catch (error) {
            if (isCurrent()) showToast('error', error instanceof Error ? error.message : '删除记录失败');
        }
    };

    const handleTogglePin = async (id: string) => {
        const scope = notesLifecycle.current;
        if (!scope || scope.identity !== accountIdentity || scope.controller.signal.aborted || !userId) return;
        const isCurrent = () => notesLifecycle.current === scope && !scope.controller.signal.aborted;
        try {
            await toggleRecordPin(id, { signal: scope.controller.signal });
            if (isCurrent()) await reloadRecordsRef.current?.();
        } catch (error) {
            if (isCurrent()) showToast('error', error instanceof Error ? error.message : '更新记录失败');
        }
    };

    const handleRecordSaved = () => {
        const scope = notesLifecycle.current;
        if (!scope || scope.identity !== accountIdentity || scope.controller.signal.aborted) return;
        setShowRecordForm(false);
        setEditingRecord(null);
        void reloadRecordsRef.current?.();
    };

    const handleImported = () => {
        const scope = notesLifecycle.current;
        if (!scope || scope.identity !== accountIdentity || scope.controller.signal.aborted) return;
        void reloadRecordsRef.current?.();
        void loadNotes();
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div className="min-h-screen bg-background text-foreground pb-20 lg:pb-8">
            <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in space-y-10">
                {/* 标题与操作栏 */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-border/60">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold">命理记录</h1>
                        <p className="text-sm text-foreground/50">追踪运势变化，积累命理智慧</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowImportExport(true)}
                            className="p-2 rounded-md border border-border hover:bg-background-secondary transition-colors text-foreground/70"
                            title="数据管理"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowRecordForm(true)}
                            className="flex items-center gap-2 px-4 py-1.5 bg-[#2383e2] text-white text-sm font-medium rounded-md hover:bg-[#2383e2]/90 active:bg-[#1a65b0] transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            <span>新建记录</span>
                        </button>
                    </div>
                </header>

                <div className="space-y-10">
                    {/* 小记区域 */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-semibold text-foreground/40 uppercase tracking-widest px-1">今日小记</h2>
                        <div className="bg-background border border-border rounded-md overflow-hidden">
                            {notesError ? (
                                <SectionError message={notesError} onRetry={loadNotes} />
                            ) : notesLoading ? (
                                <div className="p-6">
                                    <SoundWaveLoader variant="block" text="加载小记中" />
                                </div>
                            ) : (
                                <DailyNotes userId={user?.id ?? null} notes={notes} onRefresh={loadNotes} />
                            )}
                        </div>
                    </section>

                    {/* 筛选与列表 */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-semibold text-foreground/40 uppercase tracking-widest px-1">所有记录</h2>
                        <div className="space-y-4">
                            <RecordFilters
                                search={search}
                                onSearchChange={(v) => { setSearch(v); setPage(1); }}
                                category={category}
                                onCategoryChange={(v) => { setCategory(v); setPage(1); }}
                            />

                            <div className="bg-background border border-border rounded-md overflow-hidden">
                                {recordsError && !loading ? (
                                    <SectionError message={recordsError} onRetry={loadRecords} />
                                ) : (
                                    <RecordsList
                                        loading={loading}
                                        records={records}
                                        page={page}
                                        totalPages={totalPages}
                                        onPageChange={setPage}
                                        onEdit={(record) => { setEditingRecord(record); setShowRecordForm(true); }}
                                        onDelete={(id) => setDeleteRecordId(id)}
                                        onTogglePin={handleTogglePin}
                                        onAddToKnowledgeBase={openAddToKb}
                                        onCreateNew={() => setShowRecordForm(true)}
                                    />
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                {/* 模态框 */}
                {showRecordForm && (
                    <RecordFormModal
                        userId={user?.id ?? null}
                        record={editingRecord}
                        onClose={() => { setShowRecordForm(false); setEditingRecord(null); }}
                        onSave={handleRecordSaved}
                    />
                )}

                {showImportExport && (
                    <ImportExportModal
                        userId={user?.id ?? null}
                        onClose={() => setShowImportExport(false)}
                        onImport={handleImported}
                    />
                )}

                {kbTargetRecord && (
                    <AddToKnowledgeBaseModal
                        open
                        onClose={closeKbModal}
                        onSuccess={({ sourceId, kbId }) => handleKnowledgeBaseSuccess({ sourceId, kbId })}
                        sourceTitle={kbTargetRecord.title}
                        sourceType={MING_RECORD_SOURCE_TYPE}
                        sourceId={kbTargetRecord.id}
                    />
                )}

                <ConfirmDialog
                    isOpen={!!deleteRecordId}
                    onClose={() => setDeleteRecordId(null)}
                    onConfirm={() => deleteRecordId ? handleDelete(deleteRecordId) : undefined}
                    title="确认删除"
                    description="确定要删除这条记录吗？此操作无法撤销。"
                    confirmText="确认删除"
                    variant="danger"
                />
            </div>
        </div>
    );
}
