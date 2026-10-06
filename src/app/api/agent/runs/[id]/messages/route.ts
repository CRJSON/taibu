import { type NextRequest } from 'next/server';
import { agentEndpoint, controlAgentTask } from '@/lib/agent/api.server';
export const runtime='nodejs';
export function POST(request:NextRequest,context:{params:Promise<{id:string}>}){return agentEndpoint(async()=>controlAgentTask(request,(await context.params).id,'message'));}
