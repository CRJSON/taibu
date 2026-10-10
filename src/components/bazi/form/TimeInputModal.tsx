/**
 * 时间输入模态框组件
 *
 * 'use client' 标记说明：
 * - 使用 useState 管理模态框状态
 * - 包含交互式时间选择
 */
'use client';

import { useState } from 'react';
import { Clock, X } from 'lucide-react';
import type { BaziFormData } from '@/types';
import { HOUR_OPTIONS } from '@/components/bazi/form/options';
import { useToast } from '@/components/ui/Toast';
import { resolveBirthTimeOptions } from '@/lib/divination/birth-time';
import { DEFAULT_DIVINATION_TIMEZONE } from 'taibu-core/timezone-utils';

interface TimeInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    formData: BaziFormData;
    unknownTime: boolean;
    onToggleUnknownTime: () => void;
    onUpdate: <K extends keyof BaziFormData>(field: K, value: BaziFormData[K]) => void;
    allowUnknownTime?: boolean;
    onConfirm?: () => void;
}

export function TimeInputModal({
    isOpen,
    onClose,
    formData,
    unknownTime,
    onToggleUnknownTime,
    onUpdate,
    allowUnknownTime = true,
    onConfirm,
}: TimeInputModalProps) {
    const [localHour, setLocalHour] = useState(formData.birthHour);
    const [localMinute, setLocalMinute] = useState(formData.birthMinute);
    const [localUnknownTime, setLocalUnknownTime] = useState(unknownTime);
    const [localTimezone, setLocalTimezone] = useState(formData.timezone ?? DEFAULT_DIVINATION_TIMEZONE);
    const [localDisambiguation, setLocalDisambiguation] = useState<string>(formData.disambiguation ?? 'reject');
    const { showToast } = useToast();

    // 当模态框打开时，同步外部值到本地状态
    const [lastIsOpen, setLastIsOpen] = useState(isOpen);
    if (isOpen && !lastIsOpen) {
        setLocalHour(formData.birthHour);
        setLocalMinute(formData.birthMinute);
        setLocalTimezone(formData.timezone ?? DEFAULT_DIVINATION_TIMEZONE);
        setLocalDisambiguation(formData.disambiguation ?? 'reject');
        // 打开模态框时默认显示"已知时辰"，方便用户直接选择时间
        setLocalUnknownTime(false);
    }
    if (isOpen !== lastIsOpen) {
        setLastIsOpen(isOpen);
    }

    const handleConfirm = () => {
        let options;
        try {
            options = resolveBirthTimeOptions({ timezone: localTimezone, disambiguation: localDisambiguation });
        } catch (error) {
            showToast('warning', error instanceof Error ? error.message : '时间规则无效');
            return;
        }
        onUpdate('timezone', options.timezone);
        onUpdate('disambiguation', options.disambiguation);
        onUpdate('birthHour', localHour);
        onUpdate('birthMinute', localMinute);
        if (allowUnknownTime && localUnknownTime !== unknownTime) {
            onToggleUnknownTime();
        }
        onConfirm?.();
        onClose();
    };

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const timeValue = e.target.value;
        if (timeValue) {
            const [hours, minutes] = timeValue.split(':').map(Number);
            setLocalHour(hours);
            setLocalMinute(minutes);
        }
    };

    const formatTimeValue = () => {
        const hour = String(localHour).padStart(2, '0');
        const minute = String(localMinute || 0).padStart(2, '0');
        return `${hour}:${minute}`;
    };

    if (!isOpen) return null;

    // knowTime 表示"知道时辰"，是 localUnknownTime（不知时辰）的反义
    const knowTime = allowUnknownTime ? !localUnknownTime : true;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            {/* 遮罩层 */}
            <div
                className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
                onClick={onClose}
            />

            {/* 模态框内容 */}
            <div className="relative bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border text-foreground">
                {/* 头部 */}
                <div className="sticky top-0 bg-background border-b border-border/60 px-6 py-4 flex items-center justify-between z-10">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-accent" />
                        出生时辰
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-foreground-secondary hover:text-foreground hover:bg-background-secondary p-1 rounded-md transition-all duration-150"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 内容 */}
                <div className="p-6 space-y-6">
                    {/* 不知时辰开关 */}
                    {allowUnknownTime && (
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-sm font-bold uppercase tracking-wider text-foreground-secondary">
                                {knowTime ? '已知时辰' : '不知时辰'}
                            </span>
                            <div
                                onClick={() => setLocalUnknownTime(!localUnknownTime)}
                                className={`
                                    relative w-10 h-5 rounded-full transition-all duration-150 ease-out flex items-center
                                    ${knowTime ? 'bg-accent' : 'bg-background-secondary'}
                                `}
                            >
                                <div
                                    className={`
                                        absolute w-4 h-4 bg-background rounded-full shadow-sm
                                        transition-all duration-150
                                        ${knowTime ? 'translate-x-5.5' : 'translate-x-0.5'}
                                    `}
                                />
                            </div>
                        </label>
                    )}

                    {/* 具体时间输入 - 仅当知道时辰时显示 */}
                    {knowTime && (
                        <div className="space-y-6 animate-fade-in">
                            {/* 精确时间输入框 */}
                            <div className="flex items-center gap-4 bg-background p-4 rounded-md border border-border/60">
                                <label className="text-xs font-bold uppercase tracking-wider text-foreground-secondary whitespace-nowrap">
                                    精确时间
                                </label>
                                <input
                                    type="time"
                                    value={formatTimeValue()}
                                    onChange={handleTimeChange}
                                    className="flex-1 bg-background border border-border rounded-md px-4 py-2 text-center font-mono text-lg text-foreground
                                        focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent
                                        transition-all duration-150"
                                />
                            </div>

                            {/* 时辰快捷选择 */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-xs font-bold uppercase tracking-wider text-foreground-secondary">
                                        快捷选择时辰
                                    </label>
                                    <span className="text-[10px] font-medium text-foreground-secondary">
                                        点击选择将自动修正时间
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                                    {HOUR_OPTIONS.map(({ value, name, time }) => {
                                        const isSelected = localHour === value && (localMinute || 0) === 0;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => {
                                                    setLocalHour(value);
                                                    setLocalMinute(0);
                                                }}
                                                className={`
                                                    relative overflow-hidden
                                                    py-2 px-1 rounded-md border text-sm transition-all duration-150
                                                    flex flex-col items-center justify-center gap-0.5
                                                    ${isSelected
                                                        ? 'bg-accent text-on-accent border-accent'
                                                        : 'bg-transparent border-border text-foreground hover:bg-background-secondary'
                                                    }
                                                `}
                                            >
                                                <span className={`font-bold ${isSelected ? 'text-white' : ''}`}>
                                                    {name}
                                                </span>
                                                <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-foreground-secondary font-medium'}`}>
                                                    {time}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="space-y-4 border-t border-border/60 pt-4">
                        <label className="block text-sm">
                            出生地时区（IANA）
                            <input
                                type="text"
                                value={localTimezone}
                                onChange={event => setLocalTimezone(event.target.value)}
                                placeholder="Asia/Shanghai"
                                maxLength={100}
                                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                            />
                        </label>
                        <label className="block text-sm">
                            夏令时重复／缺失时间
                            <select
                                value={localDisambiguation}
                                onChange={event => setLocalDisambiguation(event.target.value)}
                                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                            >
                                <option value="reject">遇到歧义时提示错误（默认）</option>
                                <option value="earlier">选择较早的瞬间</option>
                                <option value="later">选择较晚的瞬间</option>
                                <option value="compatible">兼容模式：重复取早，缺失取晚</option>
                            </select>
                        </label>
                        <p className="text-xs text-foreground-secondary">输入出生地当时的民用钟表时间。时区规则包含历史夏令时；只有确知取舍时才调整默认策略。</p>
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="sticky bottom-0 bg-background/80 backdrop-blur-md border-t border-border/60 px-6 py-4 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-background border border-border rounded-md text-sm font-semibold text-foreground
                            hover:bg-background-secondary active:bg-background-tertiary transition-all duration-150"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="flex-1 px-4 py-2 bg-accent text-on-accent rounded-md text-sm font-semibold
                            hover:bg-accent/90 active:bg-accent-hover transition-all duration-150"
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    );
}
