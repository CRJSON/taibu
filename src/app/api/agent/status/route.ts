import { type NextRequest } from 'next/server';
import { agentCapabilities, agentEndpoint } from '@/lib/agent/api.server';
export const runtime='nodejs';
export function GET(request:NextRequest){return agentEndpoint(()=>agentCapabilities(request));}
