export interface ParallelAnalysisResult {
  system: string;
  conversationId: number;
  status: 'running' | 'completed' | 'failed';
  agentId?: string;
  name?: string;
  modelName?: string;
  model?: string;
  answer?: string;
}

export function parallelAnalysisResults(value: unknown): ParallelAnalysisResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const analyses = (value as { analyses?: unknown }).analyses;
  if (!Array.isArray(analyses) || analyses.length > 4) return [];
  return analyses.filter((item): item is ParallelAnalysisResult => item && typeof item === 'object' &&
    typeof item.system === 'string' && typeof item.conversationId === 'number' &&
    ['running', 'completed', 'failed'].includes(item.status) &&
    ['agentId', 'name', 'modelName', 'model', 'answer'].every(key => item[key] === undefined || typeof item[key] === 'string'));
}
