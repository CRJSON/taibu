import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validation';
import { AGENT_MEMORY_SELECT, validMemory } from '@/lib/agent/memory';

async function context(request: NextRequest): Promise<{ error: Response } | { db: SupabaseClient; userId: string }> {
    const auth = await requireUserContext(request);
    if ('error' in auth) return { error: jsonError(auth.error.message, auth.error.status) };
    const expected = request.headers.get('X-Expected-User-Id');
    if (expected !== null && expected !== auth.user.id) return { error: jsonError('账号已切换', 409) };
    const db = resolveRequestDbClient(auth);
    return db ? { db, userId: auth.user.id } : { error: jsonError('记忆服务暂不可用', 500) };
}
export async function GET(request: NextRequest) {
    const auth = await context(request);
    if ('error' in auth) return auth.error;
    const { data, error } = await auth.db.from('user_agent_memory').select(AGENT_MEMORY_SELECT).eq('user_id', auth.userId).order('updated_at', { ascending: false }).limit(128);
    return error ? jsonError('读取记忆失败', 500) : jsonOk({ memories: data ?? [] });
}
export async function POST(request: NextRequest) {
    const auth = await context(request);
    if ('error' in auth) return auth.error;
    const body = await request.json().catch(() => null);
    if (!validMemory(body)) return jsonError('记忆标题或正文无效', 400);
    const { data, error } = await auth.db.from('user_agent_memory').upsert({ user_id: auth.userId, title: body.title.trim(), content: body.content.trim(), kind: body.kind, source_run_id: null, source_text: '用户手动保存' }, { onConflict: 'user_id,fingerprint' }).select(AGENT_MEMORY_SELECT).single();
    return error ? jsonError('保存记忆失败或已达到 128 条上限', 409) : jsonOk({ memory: data });
}
export async function DELETE(request: NextRequest) {
    const auth = await context(request);
    if ('error' in auth) return auth.error;
    const body = await request.json().catch(() => null);
    if (!isValidUUID(body?.id)) return jsonError('记忆标识无效', 400);
    const { data, error } = await auth.db.from('user_agent_memory').delete().eq('user_id', auth.userId).eq('id', body.id).select('id');
    return error ? jsonError('删除记忆失败', 500) : !data?.length ? jsonError('记忆不存在', 404) : jsonOk({ deleted: true });
}
