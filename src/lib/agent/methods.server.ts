import 'server-only';
import { AI_PERSONALITIES } from '@/lib/ai/ai';
import type { AIPersonality } from '@/types';
export const ANALYSIS_METHODS: Array<{ id: AIPersonality; title: string; version: string; description: string }> = [
    { id: 'bazi', title: '八字分析', version: '1.0.0', description: '旺衰、格局、用神与运势' },
    { id: 'ziwei', title: '紫微斗数', version: '1.0.0', description: '宫位、星曜与四化' },
    { id: 'liuyao', title: '六爻断卦', version: '1.0.0', description: '用神、世应与动变' },
    { id: 'meihua', title: '梅花易数', version: '1.0.0', description: '体用、生克与应期' },
    { id: 'tarot', title: '塔罗解读', version: '1.0.0', description: '牌意、牌阵与行动建议' },
];
export function loadAnalysisMethod(id: string, version?: string) {
    const method = ANALYSIS_METHODS.find(item => item.id === id);
    if (!method || (version && method.version !== version)) throw new Error('分析方法或版本不存在');
    return { ...method, instructions: AI_PERSONALITIES[method.id].systemPrompt + '\n计算必须调用 Core 工具；方法包不授予工具、联网或会员权限。' };
}
