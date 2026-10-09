import 'server-only';
import { ANALYSIS_GUIDES, ANALYSIS_METHODS as GENERATED_METHODS } from './analysis-methods.generated';
export const ANALYSIS_METHODS = GENERATED_METHODS.map(method => ({ ...method, version: '1.0.0', description: method.whenToUse }));
export function loadAnalysisMethod(id: string, version?: string) {
    const method = ANALYSIS_METHODS.find(item => item.id === id) ?? ANALYSIS_METHODS.find(item => item.guide === id);
    if (!method || (version && method.version !== version)) throw new Error('分析方法或版本不存在');
    const guide = ANALYSIS_GUIDES[method.guide];
    return { ...method, id, title: guide.title, tools: ANALYSIS_METHODS.filter(item => item.guide === method.guide).map(item => item.tool), instructions: guide.body + '\n计算必须调用 Core 工具；方法包不授予工具、联网或会员权限。' };
}
