'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './overlays.css';

/** Native top-layer modal: focus containment, backdrop, Escape and focus return. */
export function Modal({ open, onClose, children, labelledBy, describedBy, className = '',
    busy = false, initialFocusRef, returnFocusRef, keepMounted = false, id,
}: {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    labelledBy: string;
    describedBy?: string;
    className?: string;
    busy?: boolean;
    initialFocusRef?: RefObject<HTMLElement | null>;
    returnFocusRef?: RefObject<HTMLElement | null>;
    keepMounted?: boolean;
    id?: string;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!open || !dialog) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const returnFocus = returnFocusRef?.current;
        dialog.showModal();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        initialFocusRef?.current?.focus();
        return () => {
            dialog.close();
            document.body.style.overflow = overflow;
            const target = returnFocus ?? previous;
            if (target?.isConnected) target.focus();
        };
    }, [open, initialFocusRef, returnFocusRef]);
    if ((!open && !keepMounted) || typeof document === 'undefined') return null;
    return createPortal(<dialog ref={ref} id={id} tabIndex={-1} aria-labelledby={labelledBy} aria-describedby={describedBy}
        aria-busy={busy || undefined} className={`app-modal ${className}`}
        onKeyDown={event => {
            if (event.key !== 'Tab' || event.defaultPrevented) return;
            const dialog = event.currentTarget;
            const focusable = [...dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex], summary, [contenteditable="true"]')]
                .filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
                    && !element.closest('[inert]') && element.getClientRects().length > 0
                    && getComputedStyle(element).visibility !== 'hidden');
            const first = focusable[0];
            const last = focusable.at(-1);
            const active = document.activeElement;
            // Native dialogs can send boundary Tab presses into browser chrome.
            if (!first || !focusable.includes(active as HTMLElement)
                || (event.shiftKey ? active === first : active === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
                if (!first) dialog.focus();
            }
        }}
        onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
        onClick={event => {
            if (busy || event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
        }}>{children}</dialog>, document.body);
}
