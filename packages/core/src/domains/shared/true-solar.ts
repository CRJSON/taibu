import type { TrueSolarTimeInfo } from './types.js';
import { Body, EquatorFromVector, GeoVector, RotateVector, Rotation_EQJ_EQD, SiderealTime } from 'astronomy-engine';
import { DEFAULT_DIVINATION_TIMEZONE, getTimeZoneOffsetMinutes, getZonedDateTimeParts, zonedTimeToUtc } from '../../shared/timezone-utils.js';
import { assertFiniteNumber, createUtcDateTime } from '../../shared/validation.js';

export type SolarDateTimeInput = {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  birthMinute?: number;
  timezone?: string;
  disambiguation?: 'reject' | 'earlier' | 'later' | 'compatible';
};

export type SolarDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOffset: number;
};

/** 将小时转换为时辰索引（早子时=0, 丑时=1, ..., 晚子时=12） */
export function hourToTimeIndex(hour: number): number {
  assertFiniteNumber(hour, 'hour', 0, 24 - Number.EPSILON * 16);
  if (hour >= 23) return 12;
  if (hour >= 0 && hour < 1) return 0;
  return Math.floor((hour + 1) / 2);
}

function equationOfTime(instant: Date): number {
  const equator = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(instant), GeoVector(Body.Sun, instant, true)));
  const apparentMinutes = (SiderealTime(instant) - equator.ra + 12) * 60;
  const meanMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() + instant.getUTCSeconds() / 60;
  return ((apparentMinutes - meanMinutes + 2160) % 1440) - 720;
}

function applyMinuteOffsetToSolarDateTime(
  input: SolarDateTimeInput,
  roundedOffsetMinutes: number,
): SolarDateTimeParts {
  const { birthYear, birthMonth, birthDay, birthHour, birthMinute = 0 } = input;
  const baseTime = createUtcDateTime({ year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute }).getTime();
  const shifted = new Date(baseTime + roundedOffsetMinutes * 60_000);
  const baseDay = createUtcDateTime({ year: birthYear, month: birthMonth, day: birthDay }).getTime();
  const shiftedDay = createUtcDateTime({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }).getTime();

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    dayOffset: Math.round((shiftedDay - baseDay) / 86400000),
  };
}

export function resolveTrueSolarDateTime(
  input: SolarDateTimeInput,
  longitude: number,
): SolarDateTimeParts & { trueSolarTimeInfo: TrueSolarTimeInfo; } {
  const { birthYear, birthMonth, birthDay, birthHour, birthMinute = 0 } = input;
  assertFiniteNumber(longitude, 'longitude', -180, 180);
  const timezone = input.timezone ?? DEFAULT_DIVINATION_TIMEZONE;
  const instant = zonedTimeToUtc({ year: birthYear, month: birthMonth, day: birthDay, hour: birthHour, minute: birthMinute }, timezone, input.disambiguation ?? 'reject');
  return resolveTrueSolarDateTimeFromInstant(instant, longitude, timezone);
}

/** Reuse a validated birth instant instead of resolving its civil clock a second time. */
export function resolveTrueSolarDateTimeFromInstant(
  instant: Date,
  longitude: number,
  timezone = DEFAULT_DIVINATION_TIMEZONE,
): SolarDateTimeParts & { trueSolarTimeInfo: TrueSolarTimeInfo; } {
  assertFiniteNumber(longitude, 'longitude', -180, 180);
  const clock = getZonedDateTimeParts(instant, timezone);
  const utcOffsetMinutes = getTimeZoneOffsetMinutes(timezone, instant);
  const longitudeCorrection = longitude * 4 - utcOffsetMinutes;
  const eot = equationOfTime(instant);
  const totalCorrectionMinutes = longitudeCorrection + eot;
  const roundedCorrectionMinutes = Math.round(totalCorrectionMinutes);
  const resolvedDateTime = applyMinuteOffsetToSolarDateTime({ birthYear: clock.year, birthMonth: clock.month, birthDay: clock.day, birthHour: clock.hour, birthMinute: clock.minute }, roundedCorrectionMinutes);
  const trueTimeIndex = hourToTimeIndex(resolvedDateTime.hour + resolvedDateTime.minute / 60);

  return {
    ...resolvedDateTime,
    trueSolarTimeInfo: {
      clockTime: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
      trueSolarTime: `${String(resolvedDateTime.hour).padStart(2, '0')}:${String(resolvedDateTime.minute).padStart(2, '0')}`,
      longitude,
      correctionMinutes: Math.round(totalCorrectionMinutes * 10) / 10,
      trueTimeIndex,
      dayOffset: resolvedDateTime.dayOffset,
      timezone,
      utcOffsetMinutes,
      equationOfTimeMinutes: Math.round(eot * 1000) / 1000,
      ruleVersion: 'apparent-solar-2026.10',
    },
  };
}

export function calculateTrueSolarTime(
  input: SolarDateTimeInput,
  longitude: number,
): TrueSolarTimeInfo {
  return resolveTrueSolarDateTime(input, longitude).trueSolarTimeInfo;
}
