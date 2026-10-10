'use client';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getCurrentUserSettings } from '@/lib/user/settings';
import { requestBrowserJson } from '@/lib/browser-api';
import { markAsRead, type Notification as SiteNotification } from '@/lib/notification';
type TaskNotification = SiteNotification & { event_key?: string; event_data?: { conversationId?: string; kind?: string } };
export function AgentNotificationBridge({ userId }: { userId: string | null }) {
    const { showToast } = useToast();
    useEffect(() => {
        if (!userId) return;
        const controller = new AbortController();
        const tab = crypto.randomUUID(); const presenceKey = `taibu.active-chat:${userId}:${tab}`;
        let busy = false;
        const presence = () => {
            try { const url = new URL(window.location.href); localStorage.setItem(presenceKey, JSON.stringify({ id: url.pathname === '/chat' && document.visibilityState === 'visible' && document.hasFocus() ? url.searchParams.get('id') : null, until: Date.now()+12000 })); } catch { /* optional */ }
        };
        const viewing = (conversationId: string | undefined) => {
            if (!conversationId) return false;
            const url = new URL(window.location.href);
            if (url.pathname === '/chat' && url.searchParams.get('id') === conversationId && document.visibilityState === 'visible' && document.hasFocus()) return true;
            try {
            for (let index=0; index<localStorage.length; index++) {
                const key = localStorage.key(index);
                if (!key?.startsWith(`taibu.active-chat:${userId}:`)) continue;
                try { const value = JSON.parse(localStorage.getItem(key) ?? '{}'); if (value.id === conversationId && value.until > Date.now()) return true; } catch { /* expired */ }
            }
            } catch { /* The current page still suppresses duplicate popups without storage. */ }
            return false;
        };
        const poll = async () => {
            presence(); if (busy || controller.signal.aborted) return; busy=true;
            try {
                const [settings, response] = await Promise.all([getCurrentUserSettings({ expectedUserId: userId, signal: controller.signal }), requestBrowserJson<{ notifications: TaskNotification[] }>('/api/notifications?unread=1&limit=40', { signal: controller.signal })]);
                if (controller.signal.aborted || !settings.settings || settings.settings.notificationsEnabled === false) return;
                for (const notice of response.data?.notifications ?? []) {
                    if (!notice.event_key || notice.popup_claimed_at) continue;
                    if (viewing(notice.event_data?.conversationId)) { await markAsRead(notice.id); continue; }
                    const claim = await requestBrowserJson<{ claimed: boolean }>('/api/notifications/popup', { method:'POST', body:JSON.stringify({ id:notice.id }), signal:controller.signal });
                    if (!claim.data?.claimed || controller.signal.aborted) continue;
                    showToast('info', `${notice.title} · ${notice.content ?? '可在通知中心打开对话'}`);
                    if (settings.settings?.chatPreferences.desktopNotifications && 'Notification' in window && window.Notification.permission === 'granted') {
                        const native = new window.Notification(notice.title, { body: notice.content ?? '', tag:notice.event_key });
                        native.onclick = () => { window.focus(); if (notice.link?.startsWith('/chat?')) window.location.assign(notice.link); native.close(); };
                    }
                }
            } catch { /* polling retries without generating or billing */ } finally { busy=false; }
        };
        void poll(); const timer=setInterval(() => void poll(),10000);
        window.addEventListener('focus',presence); document.addEventListener('visibilitychange',presence);
        return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus',presence); document.removeEventListener('visibilitychange',presence); try { localStorage.removeItem(presenceKey); } catch { /* optional */ } };
    }, [userId,showToast]);
    return null;
}
