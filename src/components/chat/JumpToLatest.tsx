'use client';

import { ArrowDown } from 'lucide-react';

export function JumpToLatest({ onClick }: { onClick: () => void }) {
    return <button type="button" onClick={onClick} className="chat-jump-latest" aria-label="回到最新消息"><ArrowDown size={15} aria-hidden="true" /><span>回到最新</span></button>;
}
