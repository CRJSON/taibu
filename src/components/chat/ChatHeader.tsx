/**
 * Chat 页面头部：会话标题、设置与工作区入口
 *
 * 'use client' 标记说明：
 * - 渲染条件依赖 props
 */
'use client';

import type { ReactNode } from 'react';
import { BookOpenText, MessageSquare, SquarePen } from 'lucide-react';
import { useConversationList } from '@/lib/chat/ConversationListContext';
import { SettingsCenterLink } from '@/components/settings/SettingsCenterLink';
import { SETTINGS_CENTER_TAB_ICONS } from '@/components/settings/settings-center-icons';

interface ChatHeaderProps {
    title: string;
    children?: ReactNode;
    membershipType: string;
    knowledgeBaseEnabled: boolean;
    aiPersonalizationEnabled: boolean;
}

const PersonalizationIcon = SETTINGS_CENTER_TAB_ICONS.personalization;

export function ChatHeader({
    title,
    children,
    membershipType,
    knowledgeBaseEnabled,
    aiPersonalizationEnabled,
}: ChatHeaderProps) {
    const { handleNewChat } = useConversationList();
    return (
        <header className="chat-session-header">
            <div className="chat-session-title"><MessageSquare size={17} aria-hidden="true" /><h1 title={title}>{title}</h1></div>
            <div className="chat-session-actions">
                <button type="button" className="agent-icon-button" aria-label="新建对话" title="新建对话" onClick={() => void handleNewChat()}><SquarePen size={16} /></button>
                <div className="hidden lg:flex items-center gap-1">
                    {aiPersonalizationEnabled && (
                        <SettingsCenterLink
                            tab="personalization"
                            className="chat-header-setting group"
                            title="个性化"
                        >
                            <PersonalizationIcon size={16} className="text-foreground-secondary group-hover:text-accent transition-colors" />
                            <span className="text-sm font-medium text-foreground-secondary group-hover:text-accent transition-colors">
                                个性化
                            </span>
                        </SettingsCenterLink>
                    )}

                    {membershipType !== 'free' && knowledgeBaseEnabled && (
                        <SettingsCenterLink
                            tab="knowledge-base"
                            className="chat-header-setting group"
                            title="知识库"
                        >
                            <BookOpenText className="w-4 h-4 text-foreground-secondary group-hover:text-accent transition-colors" />
                            <span className="text-sm font-medium text-foreground-secondary group-hover:text-accent transition-colors">
                                知识库
                            </span>
                        </SettingsCenterLink>
                    )}
                </div>
                {children}
            </div>
        </header>
    );
}
