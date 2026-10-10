export type AstrologyHouseSystem = 'placidus' | 'equal-house' | 'whole-sign' | 'koch' | 'campanus' | 'regiomontanus' | 'topocentric';

export type AstrologyAspectType = 'conjunction' | 'opposition' | 'trine' | 'square' | 'sextile';

export type AstrologyFactorCategory = 'body' | 'point' | 'angle';

export type AstrologyCalculationMode = 'exact' | 'approximate';

export type AstrologyCoordinateSource = 'provided' | 'assumed_zero';

export interface AstrologyInput {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  birthMinute?: number;
  latitude?: number;
  longitude?: number;
  birthPlace?: string;
  transitDateTime?: string;
  houseSystem?: AstrologyHouseSystem;
  timezone?: string;
  disambiguation?: 'reject' | 'earlier' | 'later' | 'compatible';
  zodiac?: 'tropical' | 'sidereal';
  /** 明确指定的恒星黄道偏移，单位度；本命和行运共用固定偏移。 */
  ayanamsa?: number;
  aspectOrbs?: Partial<Record<AstrologyAspectType, number>>;
}

export interface AstrologySignInfo {
  key: string;
  label: string;
  element: string;
  modality: string;
}

export interface AstrologyDegreeInfo {
  decimal: number;
  absolute: string;
  withinSign: string;
}

export interface AstrologyFactor {
  key: string;
  label: string;
  category: AstrologyFactorCategory;
  sign: AstrologySignInfo;
  house?: number;
  retrograde?: boolean;
  position: AstrologyDegreeInfo;
}

export interface AstrologyHouse {
  id: number;
  label: string;
  sign: AstrologySignInfo;
  start: AstrologyDegreeInfo;
  end: AstrologyDegreeInfo;
}

export interface AstrologyZodiacCusp {
  sign: AstrologySignInfo;
  start: AstrologyDegreeInfo;
}

export interface AstrologyAspect {
  type: AstrologyAspectType;
  label: string;
  from: {
    key: string;
    label: string;
    category: AstrologyFactorCategory;
  };
  to: {
    key: string;
    label: string;
    category: AstrologyFactorCategory;
  };
  orb: number;
  actualAngle: number;
}

export interface AstrologyChartSnapshot {
  origin: {
    localDateTime: string;
    derivedTimeZone: string;
    timezoneSource?: 'provided' | 'coordinates' | 'default';
    latitude: number;
    longitude: number;
    coordinateSource: AstrologyCoordinateSource;
    birthPlace?: string;
    utcDateTime?: string;
  };
  sunSign: AstrologySignInfo;
  bodies: AstrologyFactor[];
  points: AstrologyFactor[];
  angles: AstrologyFactor[];
  houses: AstrologyHouse[];
  zodiacCusps: AstrologyZodiacCusp[];
}

export interface AstrologyOutput {
  chartMeta: {
    zodiac: 'tropical' | 'sidereal';
    houseSystem: AstrologyHouseSystem;
    supportedBodies: string[];
    supportedAspectTypes: AstrologyAspectType[];
    calculationMode: AstrologyCalculationMode;
    calculationNote?: string;
    ephemeris?: string;
    coordinateFrame?: string;
    ruleVersion?: string;
    ayanamsa?: number;
    aspectOrbs?: Partial<Record<AstrologyAspectType, number>>;
  };
  natal: AstrologyChartSnapshot;
  transit: AstrologyChartSnapshot;
  majorAspects: AstrologyAspect[];
  transitToNatalAspects: AstrologyAspect[];
}
