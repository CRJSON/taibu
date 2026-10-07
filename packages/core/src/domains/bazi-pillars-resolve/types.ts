
export interface BaziPillarsResolveInput {
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  startYear?: number;
  endYear?: number;
  timezone?: string;
  longitude?: number;
  dayBoundary?: 'midnight' | 'zi';
  disambiguation?: 'reject' | 'earlier' | 'later' | 'compatible';
}

export interface BaziPillarsResolveCandidate {
  candidateId: string;
  /** Legacy candidates omit this field and use lunar birth fields. */
  calendarType?: 'solar' | 'lunar';
  isLeapMonth: boolean;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  birthMinute: number;
  solarText: string;
  lunarText: string;
  timeWindow?: { start: string; end: string; endExclusive: true; precision: 'minute'; timezone: string; };
  nextCall: {
    tool: 'bazi';
    arguments: {
      birthYear: number;
      birthMonth: number;
      birthDay: number;
      birthHour: number;
      birthMinute: number;
      calendarType: 'solar' | 'lunar';
      isLeapMonth: boolean;
      timezone?: string;
      longitude?: number;
      dayBoundary?: 'midnight' | 'zi';
      disambiguation?: BaziPillarsResolveInput['disambiguation'];
    };
    missing: ['gender'];
  };
}

export interface BaziPillarsResolveOutput {
  pillars: {
    yearPillar: string;
    monthPillar: string;
    dayPillar: string;
    hourPillar: string;
  };
  count: number;
  candidates: BaziPillarsResolveCandidate[];
  calculationOptions?: { startYear: number; endYear: number; timezone: string; dayBoundary: 'midnight' | 'zi'; disambiguation?: BaziPillarsResolveInput['disambiguation']; longitude?: number; precision: 'minute'; excludedAmbiguousMinutes: number; ruleVersion?: string; };
}
