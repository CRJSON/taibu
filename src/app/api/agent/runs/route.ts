import { type NextRequest } from 'next/server';
import { agentEndpoint, createAgentTask, getAgentTask } from '@/lib/agent/api.server';
export const runtime='nodejs';
export function POST(request:NextRequest){return agentEndpoint(()=>createAgentTask(request));}
export function GET(request:NextRequest){return agentEndpoint(()=>getAgentTask(request));}
