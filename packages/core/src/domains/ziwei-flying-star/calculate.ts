/**
 * 紫微斗数飞星分析核心引擎
 */

import type {
  FlyingStarResult,
  ZiweiFlyingStarInput,
  ZiweiFlyingStarOutput,
} from './types.js';
import type {
  FlyingStarActualFlight,
  FlyingStarQuery,
  MutagedPlaceInfo,
  SurroundedPalaceInfo,
} from '../shared/types.js';
import { createAstrolabeWithTrueSolar, MUTAGEN_NAMES, type MutagenName } from '../ziwei/shared.js';
import { getAstrolabeMutagens, getZiweiOptions, snapshotZiweiResult } from '../ziwei/profile.js';
import { CoreInputError, resolveEnum } from '../../shared/validation.js';

export type { ZiweiFlyingStarInput, ZiweiFlyingStarOutput } from './types.js';

type FunctionalPalace = NonNullable<ReturnType<ReturnType<typeof createAstrolabeWithTrueSolar>['astrolabe']['palace']>>;

function buildActualFlights(
  palace: FunctionalPalace,
  mutagens: readonly string[],
  astrolabe: ReturnType<typeof createAstrolabeWithTrueSolar>['astrolabe'],
): FlyingStarActualFlight[] {
  const requested = mutagens.length > 0 ? mutagens : [...MUTAGEN_NAMES];
  const places = palace.mutagedPlaces();
  const stemMutagens = getAstrolabeMutagens(astrolabe, palace.heavenlyStem);

  const result: FlyingStarActualFlight[] = [];
  for (const mutagen of requested) {
    const index = MUTAGEN_NAMES.indexOf(mutagen as MutagenName);
    if (index < 0) continue;
    result.push({
      mutagen,
      targetPalace: places[index]?.name ?? null,
      starName: stemMutagens[index] || null,
    });
  }

  return result;
}

function processQuery(
  astrolabe: ReturnType<typeof createAstrolabeWithTrueSolar>['astrolabe'],
  query: FlyingStarQuery,
  idx: number,
): FlyingStarResult {
  switch (query.type) {
    case 'fliesTo': {
      const palace = astrolabe.palace(query.from);
      if (!palace) throw new Error(`宫位 "${query.from}" 不存在`);
      const mutagens = (query.mutagens?.length ? query.mutagens : MUTAGEN_NAMES) as MutagenName[];
      const result = palace.fliesTo(query.to, mutagens);
      return {
        queryIndex: idx,
        type: 'fliesTo',
        result,
        queryTarget: {
          fromPalace: query.from,
          toPalace: query.to,
          mutagens: [...mutagens],
        },
        sourcePalaceGanZhi: `${palace.heavenlyStem}${palace.earthlyBranch}`,
        actualFlights: buildActualFlights(palace, mutagens, astrolabe),
      };
    }
    case 'selfMutaged': {
      const palace = astrolabe.palace(query.palace);
      if (!palace) throw new Error(`宫位 "${query.palace}" 不存在`);
      const mutagens = (query.mutagens?.length ? query.mutagens : MUTAGEN_NAMES) as MutagenName[];
      const result = palace.selfMutaged(mutagens);
      return {
        queryIndex: idx,
        type: 'selfMutaged',
        result,
        queryTarget: {
          palace: query.palace,
          mutagens: [...mutagens],
        },
        sourcePalaceGanZhi: `${palace.heavenlyStem}${palace.earthlyBranch}`,
      };
    }
    case 'mutagedPlaces': {
      const palace = astrolabe.palace(query.palace);
      if (!palace) throw new Error(`宫位 "${query.palace}" 不存在`);
      const places = palace.mutagedPlaces();
      const result: MutagedPlaceInfo[] = MUTAGEN_NAMES.map((m, i) => ({
        mutagen: m,
        targetPalace: places[i]?.name ?? null,
      }));
      return {
        queryIndex: idx,
        type: 'mutagedPlaces',
        result,
        queryTarget: {
          palace: query.palace,
        },
        sourcePalaceGanZhi: `${palace.heavenlyStem}${palace.earthlyBranch}`,
        actualFlights: buildActualFlights(palace, MUTAGEN_NAMES, astrolabe),
      };
    }
    case 'surroundedPalaces': {
      const surrounded = astrolabe.surroundedPalaces(query.palace);
      if (!surrounded) throw new Error(`宫位 "${query.palace}" 不存在`);
      const result: SurroundedPalaceInfo = {
        target: { name: surrounded.target.name, index: surrounded.target.index },
        opposite: { name: surrounded.opposite.name, index: surrounded.opposite.index },
        wealth: { name: surrounded.wealth.name, index: surrounded.wealth.index },
        career: { name: surrounded.career.name, index: surrounded.career.index },
      };
      return {
        queryIndex: idx,
        type: 'surroundedPalaces',
        result,
        queryTarget: {
          palace: query.palace,
        },
      };
    }
    default:
      throw new Error(`未知查询类型: ${(query as { type: string; }).type}`);
  }
}

export async function calculateZiweiFlyingStar(input: ZiweiFlyingStarInput): Promise<ZiweiFlyingStarOutput> {
  if (!input.queries || !Array.isArray(input.queries) || input.queries.length === 0) {
    throw new CoreInputError('queries', '不能为空');
  }

  for (const [index, query] of input.queries.entries()) {
    const path = `queries[${index}]`;
    if (!query || typeof query !== 'object') throw new CoreInputError(path, '必须是查询对象');
    if (!query.type) throw new CoreInputError(`${path}.type`, '不能为空');
    resolveEnum(query.type, ['fliesTo', 'selfMutaged', 'mutagedPlaces', 'surroundedPalaces'], 'fliesTo', `${path}.type`);
    const fields = query.type === 'fliesTo' ? ['from', 'to'] : ['palace'];
    for (const field of fields) {
      const value = (query as unknown as Record<string, unknown>)[field];
      if (typeof value !== 'string' || !value.trim()) throw new CoreInputError(`${path}.${field}`, '必须是宫位名称');
    }
    if ('mutagens' in query && query.mutagens !== undefined) {
      if (!Array.isArray(query.mutagens) || query.mutagens.some(m => !MUTAGEN_NAMES.includes(m as MutagenName))) throw new CoreInputError(`${path}.mutagens`, '必须是禄权科忌数组');
    }
  }

  const { astrolabe } = createAstrolabeWithTrueSolar(input);
  const results = input.queries.map((q, i) => processQuery(astrolabe, q, i));

  return snapshotZiweiResult({ results, calculationOptions: getZiweiOptions(astrolabe) });
}
