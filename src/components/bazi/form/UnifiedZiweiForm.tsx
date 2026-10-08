/**
 * 统一紫微斗数表单组件
 *
 * 'use client' 标记说明：
 * - 使用 useState 管理表单状态和模态框
 * - 包含交互式输入和模态框
 */
'use client';

import { useState } from 'react';
import { Clock, MapPin, ChevronRight } from 'lucide-react';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import type { BaziFormData } from '@/types';
import { TimeInputModal } from '@/components/bazi/form/TimeInputModal';
import { PlaceInputModal } from '@/components/bazi/form/PlaceInputModal';
import { YEAR_OPTIONS, MONTH_OPTIONS, LUNAR_MONTH_NAMES } from '@/components/bazi/form/options';
import { LunarYear } from 'lunar-javascript';
import { getDayCount } from '@/lib/date-utils';

type UpdateField = <K extends keyof BaziFormData>(field: K, value: BaziFormData[K]) => void;

interface UnifiedZiweiFormProps {
    formData: BaziFormData;
    onUpdate: UpdateField;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    isSubmitting: boolean;
    onBirthTimeConfirm?: () => void;
}

export function UnifiedZiweiForm({
    formData,
    onUpdate,
    onSubmit,
    isSubmitting,
    onBirthTimeConfirm,
}: UnifiedZiweiFormProps) {
    const [timeModalOpen, setTimeModalOpen] = useState(false);
    const [placeModalOpen, setPlaceModalOpen] = useState(false);

    const dayCount = getDayCount(formData.calendarType, formData.birthYear, formData.birthMonth, formData.isLeapMonth);
    const dayOptions = Array.from({ length: dayCount }, (_, i) => i + 1);

    // 检查是否有闰月
    const leapMonth = formData.calendarType === 'lunar'
        ? LunarYear.fromYear(formData.birthYear).getLeapMonth()
        : 0;
    const hasLeapMonth = leapMonth === formData.birthMonth;
    const placeSummary = formData.birthPlace
        ? `${formData.birthPlace}${formData.longitude != null ? '（已启用真太阳时）' : '（提交时自动解析）'}`
        : '未设置（使用北京时间）';

    return (
        <>
            <form onSubmit={onSubmit} className="bg-background rounded-lg p-6 shadow-sm border border-border space-y-3 sm:space-y-6">
                {/* 姓名输入 */}
                <div>
                    <label className="block text-xs sm:text-sm font-medium text-foreground-secondary mb-1.5 sm:mb-2">
                        姓名（可选）
                    </label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => onUpdate('name', e.target.value)}
                        placeholder="请输入姓名"
                        className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-border rounded-md bg-transparent text-sm text-foreground
                            focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent
                            transition-all duration-150"
                    />
                </div>

                {/* 性别和历法选择 - 同一行 */}
                <div className="grid grid-cols-2 gap-10 sm:gap-20">
                    {/* 性别选择 */}
                    <div>
                        <label className="block text-xs sm:text-sm font-medium text-foreground-secondary mb-1.5 sm:mb-2">
                            性别
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                onClick={() => onUpdate('gender', 'male')}
                                className={`py-1.5 sm:py-2.5 px-1 sm:px-2 rounded-md border text-xs sm:text-sm font-medium transition-all duration-150
                                    ${formData.gender === 'male'
                                        ? 'bg-accent text-on-accent border-accent'
                                        : 'bg-transparent border-border text-foreground hover:bg-background-secondary'
                                    }`}
                            >
                                男
                            </button>
                            <button
                                type="button"
                                onClick={() => onUpdate('gender', 'female')}
                                className={`py-1.5 sm:py-2.5 px-1 sm:px-2 rounded-md border text-xs sm:text-sm font-medium transition-all duration-150
                                    ${formData.gender === 'female'
                                        ? 'bg-accent text-on-accent border-accent'
                                        : 'bg-transparent border-border text-foreground hover:bg-background-secondary'
                                    }`}
                            >
                                女
                            </button>
                        </div>
                    </div>

                    {/* 历法选择（仅公历/农历） */}
                    <div>
                        <label className="block text-xs sm:text-sm font-medium text-foreground-secondary mb-1.5 sm:mb-2">
                            历法
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                            <button
                                type="button"
                                onClick={() => onUpdate('calendarType', 'solar')}
                                className={`py-1.5 sm:py-2.5 px-1 sm:px-2 rounded-md border text-xs sm:text-sm font-medium transition-all duration-150
                                    ${formData.calendarType === 'solar'
                                        ? 'bg-accent text-on-accent border-accent'
                                        : 'bg-transparent border-border text-foreground hover:bg-background-secondary'
                                    }`}
                            >
                                公历
                            </button>
                            <button
                                type="button"
                                onClick={() => onUpdate('calendarType', 'lunar')}
                                className={`py-1.5 sm:py-2.5 px-1 sm:px-2 rounded-md border text-xs sm:text-sm font-medium transition-all duration-150
                                    ${formData.calendarType === 'lunar'
                                        ? 'bg-accent text-on-accent border-accent'
                                        : 'bg-transparent border-border text-foreground hover:bg-background-secondary'
                                    }`}
                            >
                                农历
                            </button>
                        </div>
                    </div>
                </div>

                {/* 日期选择 */}
                <div className="space-y-2 sm:space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs text-foreground-secondary mb-1">年</label>
                            <select
                                value={formData.birthYear}
                                onChange={(e) => onUpdate('birthYear', Number(e.target.value))}
                                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-border rounded-md bg-transparent text-sm text-foreground
                                    focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                            >
                                {YEAR_OPTIONS.map((year) => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-foreground-secondary mb-1">月</label>
                            <select
                                value={formData.birthMonth}
                                onChange={(e) => onUpdate('birthMonth', Number(e.target.value))}
                                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-border rounded-md bg-transparent text-sm text-foreground
                                    focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                            >
                                {MONTH_OPTIONS.map((month) => (
                                    <option key={month} value={month}>
                                        {formData.calendarType === 'lunar' ? LUNAR_MONTH_NAMES[month] : `${month}月`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-foreground-secondary mb-1">日</label>
                            <select
                                value={formData.birthDay}
                                onChange={(e) => onUpdate('birthDay', Number(e.target.value))}
                                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-border rounded-md bg-transparent text-sm text-foreground
                                    focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                            >
                                {dayOptions.map((day) => (
                                    <option key={day} value={day}>{day}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 闰月开关（仅农历） */}
                    {formData.calendarType === 'lunar' && hasLeapMonth && (
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.isLeapMonth}
                                onChange={(e) => onUpdate('isLeapMonth', e.target.checked)}
                                className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
                            />
                            <span className="text-sm text-foreground-secondary">闰月</span>
                        </label>
                    )}
                </div>

                {/* 出生时间（点击打开模态框） */}
                <button
                    type="button"
                    onClick={() => setTimeModalOpen(true)}
                    className="w-full flex items-center justify-between p-3 sm:p-4 border border-border rounded-md
                        hover:bg-background-secondary transition-all duration-150"
                >
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                        <span className="text-xs sm:text-sm font-medium text-foreground">出生时间</span>
                        <span className="text-xs text-foreground-secondary">
                            {`${String(formData.birthHour).padStart(2, '0')}:${String(formData.birthMinute).padStart(2, '0')}`}
                        </span>
                    </div>
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-foreground-secondary" />
                </button>

                {/* 出生地点（点击打开模态框） */}
                <button
                    type="button"
                    onClick={() => setPlaceModalOpen(true)}
                    className="w-full flex items-center justify-between p-3 sm:p-4 border border-border rounded-md
                        hover:bg-background-secondary transition-all duration-150"
                >
                    <div className="flex items-center gap-2 sm:gap-3">
                        <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                        <span className="text-xs sm:text-sm font-medium text-foreground">出生地点</span>
                        <span className="text-xs text-foreground-secondary truncate">
                            {placeSummary}
                        </span>
                    </div>
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-foreground-secondary" />
                </button>

                {/* 提交按钮 */}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 sm:py-3 bg-accent text-on-accent rounded-md text-sm sm:text-base font-semibold
                        hover:bg-accent/90 active:bg-accent-hover transition-all duration-150
                        disabled:opacity-50 disabled:cursor-not-allowed
                        flex items-center justify-center gap-2"
                >
                    {isSubmitting ? (
                        <>
                            <SoundWaveLoader variant="inline" />
                            排盘中...
                        </>
                    ) : (
                        '开始排盘'
                    )}
                </button>

                {/* 免责声明 */}
                <p className="text-[10px] sm:text-xs text-center text-foreground-secondary">
                    紫微斗数排盘仅供参考，不构成任何建议
                </p>
            </form>

            {/* 时间输入模态框 */}
            <TimeInputModal
                isOpen={timeModalOpen}
                onClose={() => setTimeModalOpen(false)}
                formData={formData}
                unknownTime={false}
                onToggleUnknownTime={() => {}}
                onUpdate={onUpdate}
                allowUnknownTime={false}
                onConfirm={onBirthTimeConfirm}
            />

            {/* 地点输入模态框 */}
            <PlaceInputModal
                isOpen={placeModalOpen}
                onClose={() => setPlaceModalOpen(false)}
                formData={formData}
                onUpdate={onUpdate}
            />
        </>
    );
}
