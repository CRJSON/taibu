'use client';
import type { TarotCanonicalJSON } from 'taibu-core/tarot';
import { findTarotCardByChineseName } from '@/lib/divination/tarot';
import { TarotCardFace } from './TarotCardFace';

export function TarotChart({ chart }: { chart: TarotCanonicalJSON }) {
  return <section className="space-y-4">
    <h2 className="text-base font-medium">{chart.问卜设定.牌阵}</h2>
    {chart.问卜设定.问题 && <p className="text-sm text-foreground-secondary">{chart.问卜设定.问题}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">{chart.牌阵展开.map((card, index) => {
      const artwork = findTarotCardByChineseName(card.塔罗牌);
      return <article key={`${card.位置}:${index}`} className="min-w-0 space-y-2">
        <h3 className="text-xs text-foreground-secondary">{card.位置}</h3>
        <div className="relative aspect-[2/3] w-full max-w-40 rounded-lg overflow-hidden border border-border bg-background-secondary">
          {artwork ? <TarotCardFace image={artwork.image} name={card.塔罗牌} reversed={card.状态 === '逆位'} /> : <span className="flex h-full items-center justify-center p-3 text-sm">{card.塔罗牌}</span>}
        </div>
        <p className="text-sm font-medium">{card.塔罗牌} <span className="text-xs text-foreground-secondary">{card.状态}</span></p>
        <p className="text-xs text-foreground-secondary">{card.核心基调.join(' · ')}</p>
      </article>;
    })}</div>
  </section>;
}
