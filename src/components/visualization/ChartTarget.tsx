'use client';

import type { ReactNode } from 'react';

export interface ChartInteraction {
  selectedIds: readonly string[];
  onSelect: (id: string) => void;
}

export function isChartTargetSelected(interaction: ChartInteraction | undefined, id: string) {
  return interaction?.selectedIds.some(selected => selected === id || selected.startsWith(id + ':')) ?? false;
}

/** An optional control for persisted chart views; ordinary result pages stay passive. */
export function ChartTarget({ interaction, id, children, className = '' }: {
  interaction?: ChartInteraction; id: string; children: ReactNode; className?: string;
}) {
  if (!interaction) return <span className={className}>{children}</span>;
  return <button type="button" className={'chart-target-control ' + className} data-chart-target={id}
    aria-pressed={interaction.selectedIds.includes(id)} onClick={() => interaction.onSelect(id)}>{children}</button>;
}
