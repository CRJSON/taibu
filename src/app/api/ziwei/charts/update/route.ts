import { createChartUpdateHandler, createOptionalBirthTimeValidator, prepareZiweiChartUpdatePayload } from '@/lib/api/chart-crud';

export const POST = createChartUpdateHandler({
    tableName: 'ziwei_charts',
    prepareUpdatePayload: prepareZiweiChartUpdatePayload,
    validateUpdatePayload: createOptionalBirthTimeValidator('紫微命盘必须提供有效的出生时辰'),
});
