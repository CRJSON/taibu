import { CoreInputError, createUtcDateTime, resolveEnum, validateCivilDateTime } from './validation.js';

export type ZonedDateTimeInput = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
};

export type LocalTimeDisambiguation = 'reject' | 'earlier' | 'later' | 'compatible';
export const DEFAULT_DIVINATION_TIMEZONE = 'Asia/Shanghai';
/** Calendar-engine ephemerides use UTC+8, not Shanghai's historical civil offsets. */
export const CALENDAR_TIMEZONE = 'Etc/GMT-8';

const FORMATTER_CACHE_LIMIT = 64;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== 'string' || !timeZone) throw new CoreInputError('timezone', '无效', 'INVALID_TIMEZONE');
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  try {
    const value = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    if (formatters.size >= FORMATTER_CACHE_LIMIT) formatters.delete(formatters.keys().next().value!);
    formatters.set(timeZone, value);
    return value;
  } catch {
    throw new CoreInputError('timezone', '无效', 'INVALID_TIMEZONE');
  }
}

export function getZonedDateTimeParts(date: Date, timeZone: string): Required<ZonedDateTimeInput> {
  if (!Number.isFinite(date.getTime())) throw new CoreInputError('date', '日期无效');
  const values: Record<string, number> = {};
  let beforeCommonEra = false;
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type === 'era') beforeCommonEra = part.value === 'BC';
    else if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return { year: beforeCommonEra ? 1 - values.year : values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute, second: values.second };
}

export function getTimeZoneOffsetMinutes(timeZone: string, date: Date): number {
  const civil = getZonedDateTimeParts(date, timeZone);
  return (createUtcDateTime(civil, false).getTime() - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** Resolve a wall clock exactly; DST gaps and overlaps require an explicit policy. */
export function zonedTimeToUtc(
  input: ZonedDateTimeInput,
  timeZone: string,
  disambiguation: LocalTimeDisambiguation = 'reject',
): Date {
  validateCivilDateTime(input);
  const policy = resolveEnum(disambiguation, ['reject', 'earlier', 'later', 'compatible'], 'reject', 'disambiguation');
  const wall = createUtcDateTime(input).getTime();
  // Sampling both sides also covers half-hour changes and international date-line jumps.
  const offsets = new Set([-36, -12, 0, 12, 36].map(hours =>
    getTimeZoneOffsetMinutes(timeZone, new Date(wall + hours * 3600000))));
  const candidates = [...offsets].map(offset => new Date(wall - offset * 60000));
  const exact = candidates.filter(date => createUtcDateTime(getZonedDateTimeParts(date, timeZone), false).getTime() === wall)
    .sort((a, b) => a.getTime() - b.getTime());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    if (policy === 'reject') throw new CoreInputError('date', '该时区的本地时间重复，请选择 earlier 或 later', 'AMBIGUOUS_LOCAL_TIME');
    return policy === 'later' ? exact[exact.length - 1] : exact[0];
  }
  if (policy === 'reject') throw new CoreInputError('date', '该时区的本地时间不存在（夏令时跳时）', 'NONEXISTENT_LOCAL_TIME');
  const shifts = candidates.map(date => ({ date,
    delta: createUtcDateTime(getZonedDateTimeParts(date, timeZone), false).getTime() - wall }));
  const direction = policy === 'earlier' ? -1 : 1;
  const shifted = shifts.filter(item => item.delta * direction > 0)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
  if (!shifted) throw new CoreInputError('date', '无法解析本地时间', 'NONEXISTENT_LOCAL_TIME');
  return shifted.date;
}

/** Adapter for libraries that consume local Date getters instead of civil fields. */
export function zonedWallClockToSystemDate(input: ZonedDateTimeInput, timeZone: string, disambiguation: LocalTimeDisambiguation = 'reject'): Date {
  return zonedInstantToSystemDate(zonedTimeToUtc(input, timeZone, disambiguation), timeZone);
}

/** Preserve an already-resolved instant, including the later occurrence of a DST fold. */
export function zonedInstantToSystemDate(instant: Date, timeZone: string): Date {
  const wall = createUtcDateTime(getZonedDateTimeParts(instant, timeZone), false);
  wall.setUTCMilliseconds(instant.getUTCMilliseconds());
  const offset = getTimeZoneOffsetMinutes(timeZone, instant);
  // A server's DST gap cannot represent another zone's valid wall time with a
  // plain Date. Keep the instant and adapt only the local calendar getters.
  return new class extends Date {
    override getFullYear() { return wall.getUTCFullYear(); }
    override getMonth() { return wall.getUTCMonth(); }
    override getDate() { return wall.getUTCDate(); }
    override getDay() { return wall.getUTCDay(); }
    override getHours() { return wall.getUTCHours(); }
    override getMinutes() { return wall.getUTCMinutes(); }
    override getSeconds() { return wall.getUTCSeconds(); }
    override getMilliseconds() { return wall.getUTCMilliseconds(); }
    override getTimezoneOffset() { return -offset; }
  }(instant.getTime());
}
