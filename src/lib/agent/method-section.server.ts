import 'server-only';
import type { PromptSection } from '@earendil-works/pi-durable';
import { ANALYSIS_CONVENTIONS, ANALYSIS_METHODS } from './analysis-methods.generated';

export function renderMethodDirectory(offered: readonly string[]): string | undefined {
    const names = new Set(offered);
    const groups = new Map<string, typeof ANALYSIS_METHODS[number][]>();
    for (const method of ANALYSIS_METHODS) if (names.has(method.tool)) {
        const group = groups.get(method.guide) ?? [];
        group.push(method);
        groups.set(method.guide, group);
    }
    if (!groups.size) return undefined;
    return ['按问题选择体系。Core 结果提供盘面；每个体系首次解读前必须调用 load_analysis_method 加载对应 id 的专家指引，并遵守其分析框架和输出要求。短回答也不得跳过，目录不能代替正文。',
        ...[...groups].map(([guide, methods]) => `- ${guide}（${methods[0].title}）：${methods[0].whenToUse.replace(/，输出.*$/, '')}；工具：${methods.map(item => item.tool).join(', ')}`),
        ANALYSIS_CONVENTIONS].join('\n');
}

export const taibuMethodSection: PromptSection = {
    key: 'taibu_methods',
    render: input => renderMethodDirectory(input.agent.tools.map(tool => tool.name)),
};
