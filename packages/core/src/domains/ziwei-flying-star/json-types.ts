import type {
  ZiweiFlyingStarResultJSON
} from '../shared/json-types.js';

export interface ZiweiFlyingStarCanonicalJSON {
  计算规则?: Record<string, unknown>;
  查询结果: ZiweiFlyingStarResultJSON[];
}
