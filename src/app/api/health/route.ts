import { jsonOk } from '@/lib/api-utils';

/** Liveness only. Dependency readiness belongs to the deployment health checks. */
export function GET() {
    return jsonOk({ ok: true }, 200, { 'Cache-Control': 'no-store' });
}
