import { type NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
export async function GET(request: NextRequest) {
    const auth = await requireUserContext(request);
    if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
    const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (!query || query.length > 200) return jsonError('搜索词须为 1–200 个字符', 400);
    const db = resolveRequestDbClient(auth);
    if (!db) return jsonError('搜索暂不可用', 503);
    const { data, error } = await db.rpc('search_conversation_messages', { p_query: query, p_limit: 30 }).abortSignal(request.signal);
    if (error) return jsonError(error.code === '57014' ? '搜索超时，请缩短搜索词后重试' : '搜索失败', error.code === '57014' ? 504 : 500);
    return jsonOk({ results: data ?? [] });
}
