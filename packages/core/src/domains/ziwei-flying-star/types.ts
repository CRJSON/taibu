import type {
  FlyingStarActualFlight,
  FlyingStarQuery,
  MutagedPlaceInfo,
  SurroundedPalaceInfo
} from '../shared/types.js';
import type { ZiweiInput, ZiweiCalculationMetadata } from '../ziwei/types.js';

// ===== 紫微飞星类型 =====

export interface ZiweiFlyingStarInput extends ZiweiInput {
  queries: FlyingStarQuery[];
}

export interface ZiweiFlyingStarOutput {
  results: FlyingStarResult[];
  calculationOptions?: ZiweiCalculationMetadata;
}

export interface FlyingStarResult {
  queryIndex: number;
  type: string;
  result: boolean | MutagedPlaceInfo[] | SurroundedPalaceInfo;
  queryTarget?: {
    fromPalace?: string;
    toPalace?: string;
    palace?: string;
    mutagens?: string[];
  };
  sourcePalaceGanZhi?: string;
  actualFlights?: FlyingStarActualFlight[];
}
