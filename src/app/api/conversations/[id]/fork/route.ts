import { randomUUID } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validation';
import { loadAllConversationMessages } from '@/lib/server/conversation-messages';
import { forkConversationMessages } from '@/lib/chat/conversation-transfer';
import { enrichConversationBasis } from '@/lib/chat/conversation-export.server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireUserContext(request);
    if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
    const { id } = await params;
    if (!isValidUUID(id)) return jsonError('对话 ID 无效', 400);
    const db = resolveRequestDbClient(auth);
    if (!db) return jsonError('创建分叉失败', 500);
    let body: { messageId?: string };
    try { body = await request.json(); } catch { return jsonError('请求体无效', 400); }
    if (typeof body?.messageId !== 'string' || body.messageId.length > 200) return jsonError('回答 ID 无效', 400);
    const { data: parent, error } = await db.from('conversations').select('id,title,personality,messages').eq('id', id).eq('user_id', auth.user.id).maybeSingle();
    if (error) return jsonError('读取对话失败', 500);
    if (!parent) return jsonError('对话不存在', 404);
    try {
        const { messages, error: messageError } = await loadAllConversationMessages(db, id);
        if (messageError) return jsonError('读取消息失败', 500);
        const copied = forkConversationMessages(await enrichConversationBasis(db, messages), body.messageId, randomUUID);
        const result = await db.rpc('fork_conversation_snapshot', { p_parent: id, p_through: body.messageId, p_source_messages: parent.messages, p_messages: copied });
        if (result.error?.code === '40001') return jsonError('当前分支已改变，请刷新后分叉', 409);
        if (result.error) return jsonError('创建分叉失败', 500);
        return jsonOk({ conversationId: result.data });
    } catch (error) { return jsonError(error instanceof Error ? error.message : '分叉失败', 400); }
}
