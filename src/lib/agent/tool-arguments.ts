type ArgumentSchema = { type?: string; enum?: unknown[]; default?: unknown; items?: ArgumentSchema; properties?: Record<string, ArgumentSchema> };

/** Repair only representations allowed by the schema. Invalid values still fail validation. */
export function prepareToolArguments(definition: unknown, value: unknown, property?: string): unknown {
    const schema = definition as ArgumentSchema;
    if (!schema || typeof schema !== 'object') return value;
    if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim())) {
        const number = Number(value.trim());
        return Number.isFinite(number) ? number : value;
    }
    if (schema.type === 'string' && typeof value === 'string' && Array.isArray(schema.enum)) {
        const trimmed = value.trim();
        const match = schema.enum.find((item: unknown) => typeof item === 'string' && item.toLowerCase() === trimmed.toLowerCase());
        if (match !== undefined) return match;
        if (property === 'detailLevel' && schema.default !== undefined && schema.enum.includes(schema.default)) return schema.default;
        return value;
    }
    if (schema.type === 'array' && Array.isArray(value) && schema.items) return value.map(item => prepareToolArguments(schema.items, item));
    if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
        const result: Record<string, unknown> = { ...value };
        for (const [name, child] of Object.entries(schema.properties ?? {})) {
            if (Object.hasOwn(result, name)) result[name] = prepareToolArguments(child, result[name], name);
            else if (child.default !== undefined) result[name] = structuredClone(child.default);
        }
        return result;
    }
    return value;
}

export function toolPolicyBlock(name: string, args: Record<string, unknown>): string | undefined {
    if (['userId', 'user_id', 'ownerId', 'owner_id', 'runId', 'run_id', 'taskId', 'task_id'].some(key => Object.hasOwn(args, key)))
        return '用户和任务归属由服务端确定，不能通过工具参数指定。';
    if (name === 'tarot' && (Object.hasOwn(args, 'seed') || Object.hasOwn(args, 'seedScope')))
        return 'Agent 随机种子由任务和工具调用固定，请移除 seed 和 seedScope。';
}
