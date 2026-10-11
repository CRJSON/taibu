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

/** Members finished out of those analysing while the task's latest collaboration runs; null otherwise. */
export function collaborationProgress(parts: ReadonlyArray<{ type: string; name?: string; status?: string; output?: unknown }>, configured = 0): { completed: number; total: number } | null {
  const tool = parts.findLast(part => part.type === 'tool' && part.name === 'parallel_analysis');
  if (!tool || (tool.status !== 'pending' && tool.status !== 'running')) return null;
  const results = parallelAnalysisResults(tool.output);
  const total = Math.max(configured, results.length);
  return total ? { completed: results.filter(result => result.status !== 'running').length, total } : null;
}
