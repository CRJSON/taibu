'use client';
import type { ChatMessage } from '@/types';
import { scrollToMessageId } from '@/lib/chat/message-navigation';
export function ConversationMinimap({ messages, conversationKey }: { messages: ChatMessage[]; conversationKey: string }) {
    const points = messages.length <= 200 ? messages.map((message, index) => ({message,index})) : Array.from({length:200},(_,point) => { const index=Math.round(point*(messages.length-1)/199); return {message:messages[index],index}; });
    return <nav className="conversation-minimap" aria-label="对话小地图">{points.map(({message, index}) => <button key={message.id} type="button" className={message.role === 'user' ? 'is-user' : 'is-assistant'} title={`${index + 1} · ${message.content.slice(0, 80) || '任务过程'}`} aria-label={`定位第 ${index + 1} 条${message.role === 'user' ? '提问' : '回答'}`} onClick={() => scrollToMessageId(conversationKey, message.id)} />)}</nav>;
}
