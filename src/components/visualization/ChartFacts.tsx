import type { ReactNode } from 'react';

export function ChartFacts({ value }: { value: Record<string, unknown> }) {
  const display = (item: unknown): ReactNode => {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (Array.isArray(item)) return item.map(value => typeof value === 'object' ? null : String(value)).filter(Boolean).join(' · ');
    if (item && typeof item === 'object') return <ChartFacts value={item as Record<string, unknown>} />;
    return null;
  };
  return <dl className="chart-facts">{Object.entries(value).flatMap(([key, item]) => {
    const content = display(item);
    return content ? [<div key={key}><dt>{key}</dt><dd>{content}</dd></div>] : [];
  })}</dl>;
}
