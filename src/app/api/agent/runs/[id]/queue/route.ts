import { type NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validation';
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireUserContext(request);
    if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
    const { id } = await params;
    if (!isValidUUID(id)) return jsonError('任务 ID 无效', 400);
    const db = resolveRequestDbClient(auth);
    if (!db) return jsonError('修改队列失败', 500);
    let body: { sequence?: number; revision?: number; action?: string; content?: string; sortOrder?: number };
    try { body = await request.json(); } catch { return jsonError('请求体无效', 400); }
    if (!body || !Number.isSafeInteger(body.sequence) || !Number.isSafeInteger(body.revision) || !['edit','withdraw','order','promote'].includes(body.action ?? '')) return jsonError('队列操作无效', 400);
    const { data, error } = await db.rpc('agent_change_command', { p_run_id: id, p_sequence: body.sequence, p_revision: body.revision, p_action: body.action, p_payload: { content: body.content, sortOrder: body.sortOrder } });
    if (error) return jsonError(error.code === '40001' ? '输入已交给 Agent 或已被另一页面修改，请刷新队列' : '队列操作失败', error.code === '40001' ? 409 : error.code === '42501' ? 404 : 400);
    return jsonOk({ command: data });
}
