import { type NextRequest } from 'next/server';
import { agentEndpoint, streamAgentTask } from '@/lib/agent/api.server';
export const runtime='nodejs';
export function GET(request:NextRequest,context:{params:Promise<{id:string}>}){return agentEndpoint(async()=>streamAgentTask(request,(await context.params).id));}
