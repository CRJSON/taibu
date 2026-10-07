/**
 * Chart CRUD factory — shared by bazi_charts and ziwei_charts routes.
 */

import { type NextRequest } from 'next/server';
import { calculateBazi } from 'taibu-core/bazi';
import { calculateZiwei } from 'taibu-core/ziwei';
import { buildBaziInputFromStoredFields } from '@/lib/divination/bazi-record';
import { isValidBirthTimeString, resolveBirthTimeOptions } from '@/lib/divination/birth-time';
import { jsonError, jsonOk, requireUserContext, resolveRequestDbClient } from '@/lib/api-utils';
import { isValidUUID } from '@/lib/validation';

interface ChartCrudConfig {
    tableName: string;
    validateCreatePayload?: (payload: Record<string, unknown>) => string | null;
    allowedUpdateFields?: readonly string[];
    validateUpdatePayload?: (payload: Record<string, unknown>) => string | null;
    prepareUpdatePayload?: (context: ChartUpdateContext) => Promise<ChartPreparedUpdate>;
}

type ChartRouteAuth = Extract<
    Awaited<ReturnType<typeof requireUserContext>>,
    { user: { id: string }; db: { from: (tableName: string) => unknown } }
>;

type ChartUpdateContext = {
    auth: ChartRouteAuth;
    db: NonNullable<ReturnType<typeof resolveRequestDbClient>>;
    chartId: string;
    payload: Record<string, unknown>;
};

type ChartPreparedUpdate
    = { payload: Record<string, unknown> }
    | { error: string; status?: number };

const DEFAULT_ALLOWED_UPDATE_FIELDS = [
    'name',
    'birth_date',
    'birth_time',
    'gender',
    'birth_place',
    'longitude',
    'is_leap_month',
    'calendar_type',
    'timezone',
    'disambiguation',
] as const;

const BIRTH_RECALCULATION_FIELDS = 'id, user_id, gender, birth_date, birth_time, birth_place, longitude, calendar_type, is_leap_month, timezone, disambiguation';
const BIRTH_UPDATE_FIELDS = DEFAULT_ALLOWED_UPDATE_FIELDS.filter(field => field !== 'name' && field !== 'birth_place');

export function validateRequiredBirthTime(payload: Record<string, unknown>): string | null {
    return isValidBirthTimeString(payload.birth_time)
        ? null
        : '紫微命盘必须提供有效的出生时辰';
}

export function createRequiredBirthTimeValidator(message: string) {
    return (payload: Record<string, unknown>): string | null => (
        isValidBirthTimeString(payload.birth_time)
            ? null
            : message
    );
}

export function createOptionalBirthTimeValidator(message: string) {
    return (payload: Record<string, unknown>): string | null => {
        if (!Object.prototype.hasOwnProperty.call(payload, 'birth_time')) {
            return null;
        }
        return isValidBirthTimeString(payload.birth_time) ? null : message;
    };
}

function calculateChartBirthFields(payload: Record<string, unknown>, tableName: string): Record<string, unknown> {
    const input = buildBaziInputFromStoredFields(payload);
    const options = resolveBirthTimeOptions(payload);
    if (tableName === 'bazi_charts') {
        const output = calculateBazi(input);
        return { ...options, day_master: output.dayMaster, day_branch: output.fourPillars.day.branch };
    }
    calculateZiwei(input);
    return options;
}

async function prepareChartBirthUpdate(context: ChartUpdateContext, tableName: 'bazi_charts' | 'ziwei_charts'): Promise<ChartPreparedUpdate> {
    const { auth, chartId, payload, db } = context;
    const needsRecalculation = BIRTH_UPDATE_FIELDS.some(field => Object.hasOwn(payload, field));
    if (!needsRecalculation && tableName === 'ziwei_charts') return { payload };
    const { data, error } = await db
        .from(tableName)
        .select(BIRTH_RECALCULATION_FIELDS)
        .eq('id', chartId)
        .eq('user_id', auth.user.id)
        .maybeSingle();
    if (error) return { error: error.message, status: 500 };
    if (!data) return { error: '未找到可更新的命盘', status: 404 };

    const merged = { ...data, ...payload };
    if (!isValidBirthTimeString(merged.birth_time)) {
        return { error: `${tableName === 'bazi_charts' ? '八字' : '紫微'}命盘必须提供有效的出生时辰`, status: 400 };
    }
    if (!needsRecalculation) return { payload };
    try {
        return { payload: { ...payload, ...calculateChartBirthFields(merged, tableName) } };
    } catch (error) {
        return { error: error instanceof Error ? error.message : '命盘出生参数无效', status: 400 };
    }
}

export function prepareBaziChartUpdatePayload(context: ChartUpdateContext): Promise<ChartPreparedUpdate> {
    return prepareChartBirthUpdate(context, 'bazi_charts');
}

export function prepareZiweiChartUpdatePayload(context: ChartUpdateContext): Promise<ChartPreparedUpdate> {
    return prepareChartBirthUpdate(context, 'ziwei_charts');
}

function sanitizeUpdatePayload(
    payload: Record<string, unknown>,
    allowedFields: readonly string[],
): Record<string, unknown> {
    const sanitizedPayload: Record<string, unknown> = {};
    for (const key of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitizedPayload[key] = payload[key];
        }
    }
    return sanitizedPayload;
}

export function createChartGetHandler(config: ChartCrudConfig) {
    return async function GET(request: NextRequest) {
        const auth = await requireUserContext(request);
        if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
        const expectedUserId = request.headers.get('X-Expected-User-Id');
        if (expectedUserId !== null && expectedUserId !== auth.user.id) {
            return jsonError('账号已切换，请重新加载命盘', 409);
        }
        const db = resolveRequestDbClient(auth);
        if (!db) return jsonError('获取命盘失败', 500);

        const id = request.nextUrl.searchParams.get('id');
        if (!id) {
            return jsonError('缺少命盘 ID', 400);
        }

        const { data, error } = await db
            .from(config.tableName)
            .select('*')
            .eq('id', id)
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (error) {
            return jsonError('获取命盘失败', 500);
        }
        if (!data) {
            return jsonError('命盘不存在', 404);
        }

        return jsonOk({ chart: data });
    };
}

export function createChartPostHandler(config: ChartCrudConfig) {
    return async function POST(request: NextRequest) {
        const auth = await requireUserContext(request);
        if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
        const expectedUserId = request.headers.get('X-Expected-User-Id');
        if (expectedUserId !== null && expectedUserId !== auth.user.id) {
            return jsonError('账号已切换，请重新加载命盘', 409);
        }
        const db = resolveRequestDbClient(auth);
        if (!db) return jsonError('保存命盘失败', 500);

        let body: { payload?: Record<string, unknown> };
        try {
            body = await request.json() as { payload?: Record<string, unknown> };
        } catch {
            return jsonError('请求体不是合法 JSON', 400);
        }

        if (!body || typeof body !== 'object' || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
            return jsonError('缺少有效的命盘数据', 400);
        }

        const validationError = config.validateCreatePayload?.(body.payload as Record<string, unknown>);
        if (validationError) {
            return jsonError(validationError, 400);
        }

        const payload: Record<string, unknown> = {
            ...(body.payload as Record<string, unknown>),
            user_id: auth.user.id,
        };

        try {
            Object.assign(payload, calculateChartBirthFields(payload, config.tableName));
        } catch (error) {
            return jsonError(error instanceof Error ? error.message : '命盘出生参数无效', 400);
        }

        const { data, error } = await db
            .from(config.tableName)
            .insert(payload)
            .select('id')
            .maybeSingle();

        if (error) {
            return jsonError('保存命盘失败', 500);
        }

        return jsonOk({ id: data?.id ?? null }, 201);
    };
}

export function createChartUpdateHandler(config: ChartCrudConfig) {
    return async function POST(request: NextRequest) {
        const auth = await requireUserContext(request);
        if ('error' in auth) return jsonError(auth.error.message, auth.error.status);
        const expectedUserId = request.headers.get('X-Expected-User-Id');
        if (expectedUserId !== null && expectedUserId !== auth.user.id) {
            return jsonError('账号已切换，请重新加载命盘', 409);
        }
        const db = resolveRequestDbClient(auth);
        if (!db) return jsonError('更新失败', 500);

        let body: { chartId?: unknown; payload?: unknown };
        try {
            body = await request.json() as { chartId?: unknown; payload?: unknown };
        } catch {
            return jsonError('请求体不是合法 JSON', 400);
        }

        if (!body || typeof body !== 'object' || typeof body.chartId !== 'string' || !body.chartId.trim()) {
            return jsonError('缺少必要参数', 400);
        }

        if (!isValidUUID(body.chartId)) {
            return jsonError('chartId 格式不合法', 400);
        }

        if (!body || typeof body !== 'object' || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
            return jsonError('缺少有效的命盘数据', 400);
        }

        const sanitizedPayload = sanitizeUpdatePayload(
            body.payload as Record<string, unknown>,
            config.allowedUpdateFields ?? DEFAULT_ALLOWED_UPDATE_FIELDS,
        );

        if (Object.keys(sanitizedPayload).length === 0) {
            return jsonError('没有可更新的字段', 400);
        }

        const validationError = config.validateUpdatePayload?.(sanitizedPayload);
        if (validationError) {
            return jsonError(validationError, 400);
        }

        let updatePayload = sanitizedPayload;
        if (config.prepareUpdatePayload) {
            const prepared = await config.prepareUpdatePayload({
                auth,
                db,
                chartId: body.chartId,
                payload: sanitizedPayload,
            });
            if ('error' in prepared) {
                return jsonError(prepared.error, prepared.status ?? 400);
            }
            updatePayload = prepared.payload;
        }

        const { data, error } = await db
            .from(config.tableName)
            .update(updatePayload)
            .eq('id', body.chartId)
            .eq('user_id', auth.user.id)
            .select('id')
            .maybeSingle();

        if (error) {
            return jsonError(error.message, 500);
        }

        if (!data) {
            return jsonError('未找到可更新的命盘', 404);
        }

        return jsonOk({ success: true });
    };
}
