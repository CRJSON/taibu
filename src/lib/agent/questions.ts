export interface AgentQuestion { id: string; question: string; options?: { id: string; label: string }[]; multiple?: boolean; allowCustom?: boolean; allowSkip?: boolean }
export type AgentAnswers = Record<string, string[] | null>;
export function normalizeQuestions(value: unknown, legacy?: string): AgentQuestion[] {
    if (value === undefined && legacy?.trim()) return [{ id: 'question', question: legacy.trim(), allowCustom: true, allowSkip: false }];
    if (!Array.isArray(value) || !value.length || value.length > 10) throw new Error('问题数量须为 1–10');
    const ids = new Set<string>();
    return value.map(item => {
        if (!item || typeof item !== 'object') throw new Error('问题无效');
        const q = item as AgentQuestion;
        if (typeof q.id !== 'string' || !q.id.trim() || q.id.length > 80 || ids.has(q.id) || typeof q.question !== 'string' || !q.question.trim() || q.question.length > 2000) throw new Error('问题 ID 或内容无效');
        ids.add(q.id);
        const optionIds = new Set<string>();
        if (q.options !== undefined && (!Array.isArray(q.options) || q.options.length > 20)) throw new Error('选项无效');
        const options = q.options?.map(option => {
            if (!option || typeof option.id !== 'string' || !option.id.trim() || option.id.length > 80 || optionIds.has(option.id) || typeof option.label !== 'string' || !option.label.trim() || option.label.length > 400) throw new Error('选项无效');
            optionIds.add(option.id); return { id: option.id, label: option.label };
        });
        return { id: q.id, question: q.question, options, multiple: q.multiple === true, allowCustom: q.allowCustom !== false || !options?.length, allowSkip: q.allowSkip !== false };
    });
}
export function validateAnswers(questions: AgentQuestion[], value: unknown): AgentAnswers {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('答案无效');
    const input = value as AgentAnswers;
    if (Object.keys(input).some(id => !questions.some(question => question.id === id))) throw new Error('答案包含未知问题');
    const answers: AgentAnswers = Object.fromEntries(questions.map(question => {
        const answer = input[question.id];
        if (answer === null && question.allowSkip) return [question.id, null];
        if (!Array.isArray(answer) || !answer.length || answer.length > 20 || (!question.multiple && answer.length > 1) || answer.some(text => typeof text !== 'string' || !text.trim() || text.length > 8000)) throw new Error('请回答或明确跳过每个问题');
        if (!question.allowCustom && answer.some(text => !question.options?.some(option => option.id === text))) throw new Error('答案不在选项中');
        return [question.id, [...new Set(answer)]];
    }));
    if (formatQuestionAnswers(questions, answers).length > 32000) throw new Error('回答合计过长，请将详细内容作为文本资料添加');
    return answers;
}
export function formatQuestionAnswers(questions: AgentQuestion[], answers: AgentAnswers): string {
    return questions.map(question => `${question.question}\n${answers[question.id] === null ? '已跳过' : (answers[question.id] ?? []).map(answer => question.options?.find(option => option.id === answer)?.label ?? answer).join('、')}`).join('\n\n');
}
