export interface AgentPromptTemplate { id: string; name: string; content: string }
export function validPromptTemplates(value: unknown): value is AgentPromptTemplate[] {
    if (!Array.isArray(value) || value.length > 20) return false;
    const ids = new Set<string>();
    return value.every(item => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[\w-]{1,64}$/.test(item.id) || ids.has(item.id)) return false;
        ids.add(item.id);
        return typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 60 && typeof item.content === 'string' && item.content.trim().length > 0 && item.content.length <= 4000;
    });
}
export function normalizePromptTemplates(value: unknown): AgentPromptTemplate[] {
    return validPromptTemplates(value) ? value.map(item => ({ id: item.id, name: item.name.trim(), content: item.content })) : [];
}
export function applyPromptTemplate(template: AgentPromptTemplate, question: string): string {
    return template.content.includes('{{question}}') ? template.content.replaceAll('{{question}}', () => question) : `${template.content}${question.trim() ? `\n${question}` : ''}`;
}
