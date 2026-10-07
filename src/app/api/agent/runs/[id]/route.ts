import { type NextRequest } from 'next/server';
import { agentEndpoint, getAgentTask } from '@/lib/agent/api.server';
export const runtime='nodejs';
export function GET(request:NextRequest,context:{params:Promise<{id:string}>}){return agentEndpoint(async()=>getAgentTask(request,(await context.params).id));}
