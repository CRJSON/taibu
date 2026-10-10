import { type NextRequest } from 'next/server';
import { jsonError, jsonOk, requireUserContext } from '@/lib/api-utils';
import { ANALYSIS_METHODS } from '@/lib/agent/methods.server';
export async function GET(request: NextRequest) {
    const auth = await requireUserContext(request);
    if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
    return jsonOk({ methods: ANALYSIS_METHODS });
}
