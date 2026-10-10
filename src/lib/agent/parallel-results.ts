export interface ParallelAnalysisResult {
  system: string;
  conversationId: number;
  status: 'running' | 'completed' | 'failed';
  agentId?: string;
  name?: string;
  modelName?: string;
  model?: string;
  /** Effort the child conversation was configured with; 'off' when reasoning is disabled. */
  reasoningEffort?: string;
  /** The user's configured division of work for this member. */
  focus?: string;
  answer?: string;
}

const OPTIONAL_TEXT = ['agentId', 'name', 'modelName', 'model', 'reasoningEffort', 'focus', 'answer'] as const;

export function parallelAnalysisResults(value: unknown): ParallelAnalysisResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const analyses = (value as { analyses?: unknown }).analyses;
  if (!Array.isArray(analyses) || analyses.length > 4) return [];
  return analyses.filter((item): item is ParallelAnalysisResult => item && typeof item === 'object' &&
    typeof item.system === 'string' && typeof item.conversationId === 'number' &&
    ['running', 'completed', 'failed'].includes(item.status) &&
    OPTIONAL_TEXT.every(key => item[key] === undefined || typeof item[key] === 'string'));
}
