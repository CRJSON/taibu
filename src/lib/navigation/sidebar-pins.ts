/**
 * Sidebar pinned divination items — a per-browser display preference.
 *
 * The desktop sidebar only lists pinned methods; everything else lives in the
 * "全部占术" panel. Pins are a convenience, not account data, so they stay in
 * localStorage (same tier as the theme preference) and fall back to defaults
 * whenever storage is unavailable or holds something unexpected.
 */
import { useCallback, useSyncExternalStore } from 'react';

export const SIDEBAR_PINS_STORAGE_KEY = 'taibu.pref.sidebarPinned';
export const DEFAULT_SIDEBAR_PINS: readonly string[] = Object.freeze(['bazi', 'ziwei', 'tarot', 'liuyao', 'qimen']);

const MAX_PINS = 32;
const PIN_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Parse a stored pin list. Returns `null` for anything that is not an array of
 * ids so callers can fall back to defaults; drops malformed entries and duplicates.
 */
export function normalizeSidebarPins(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const pins: string[] = [];
    for (const entry of value) {
        if (typeof entry !== 'string' || !PIN_ID_PATTERN.test(entry) || pins.includes(entry)) continue;
        pins.push(entry);
        if (pins.length >= MAX_PINS) break;
    }
    return pins;
}

/** Toggle `id` in `pins`, appending new pins at the end. */
export function toggleSidebarPin(pins: readonly string[], id: string): string[] {
    return pins.includes(id) ? pins.filter(pin => pin !== id) : [...pins, id];
}

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedPins: readonly string[] = DEFAULT_SIDEBAR_PINS;
/** Set only when storage rejects a write, so the choice survives this page view. */
let memoryPins: readonly string[] | null = null;

function readRaw(): string | null {
    try {
        return window.localStorage.getItem(SIDEBAR_PINS_STORAGE_KEY);
    } catch {
        return null;
    }
}

function getSnapshot(): readonly string[] {
    if (memoryPins) return memoryPins;
    const raw = readRaw();
    if (raw === cachedRaw) return cachedPins;
    cachedRaw = raw;
    let parsed: unknown = null;
    if (raw !== null) {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    cachedPins = normalizeSidebarPins(parsed) ?? DEFAULT_SIDEBAR_PINS;
    return cachedPins;
}

function getServerSnapshot(): readonly string[] {
    return DEFAULT_SIDEBAR_PINS;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === SIDEBAR_PINS_STORAGE_KEY) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

function writePins(pins: readonly string[]) {
    try {
        window.localStorage.setItem(SIDEBAR_PINS_STORAGE_KEY, JSON.stringify(pins));
        memoryPins = null;
    } catch {
        // Private mode or quota: keep the in-memory value for this page view.
        memoryPins = pins;
    }
    listeners.forEach(listener => listener());
}

/** Pinned divination ids plus a stable toggle; SSR renders the defaults. */
export function useSidebarPins() {
    const pins = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const togglePin = useCallback((id: string) => {
        writePins(toggleSidebarPin(getSnapshot(), id));
    }, []);
    return { pins, togglePin };
}
