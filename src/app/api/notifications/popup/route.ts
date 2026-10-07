import { type NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validation';
export async function POST(request: NextRequest) {
    const auth = await requireUserContext(request);
    if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
    const db = resolveRequestDbClient(auth);
    if (!db) return jsonError('通知暂不可用', 503);
    let body: { id?: string }; try { body = await request.json(); } catch { return jsonError('通知无效', 400); }
    if (!body || typeof body.id !== 'string' || !isValidUUID(body.id)) return jsonError('通知无效', 400);
    const { data, error } = await db.rpc('claim_notification_popup', { p_id: body.id });
    if (error) return jsonError('通知领取失败', 500);
    return jsonOk({ claimed: data === true });
}
