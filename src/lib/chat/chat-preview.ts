interface ShouldRequestChatPreviewInput {
    userId?: string | null;
    isLoading: boolean;
    isSendingToList: boolean;
    agentMode?: boolean;
}

export function shouldRequestChatPreview({
    userId,
    isLoading,
    isSendingToList,
    agentMode = false,
}: ShouldRequestChatPreviewInput): boolean {
    return !!userId && !isLoading && !isSendingToList && !agentMode;
}
