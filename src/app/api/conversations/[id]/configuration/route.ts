import { type NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validation';
import { parseNextTaskConfiguration } from '@/lib/chat/model-settings';
async function scope(request: NextRequest, id: string): Promise<
    { response: ReturnType<typeof jsonError> } | { db: NonNullable<ReturnType<typeof resolveRequestDbClient>>; userId: string }
> {
    const auth = await requireUserContext(request);
    if ('error' in auth) return { response: jsonError(auth.error.message, auth.error.status) };
    if (!isValidUUID(id)) return { response: jsonError('对话 ID 无效', 400) };
    const db = resolveRequestDbClient(auth);
    if (!db) return { response: jsonError('保存配置失败', 500) };
    return { db, userId: auth.user.id };
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await scope(request, (await params).id);
    if ('response' in ctx) return ctx.response;
    const { data, error } = await ctx.db.from('conversations').select('next_task_config').eq('id', (await params).id).eq('user_id', ctx.userId).maybeSingle();
    if (error) return jsonError('读取配置失败', 500);
    if (!data) return jsonError('对话不存在', 404);
    return jsonOk({ configuration: data.next_task_config });
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await scope(request, (await params).id);
    if ('response' in ctx) return ctx.response;
    let configuration;
    try { configuration = parseNextTaskConfiguration(await request.json()); } catch { return jsonError('配置无效', 400); }
    const { data, error } = await ctx.db.from('conversations').update({ next_task_config: configuration }).eq('id', (await params).id).eq('user_id', ctx.userId).select('id').maybeSingle();
    if (error) return jsonError('保存配置失败', 500);
    if (!data) return jsonError('对话不存在', 404);
    return jsonOk({ saved: true });
}
