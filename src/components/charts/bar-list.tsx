/**
 * Horizontal magnitude bars in one hue with the label and value as text
 * (identity never by color). Works as its own table view.
 */
export function BarList({
  items,
  emptyLabel,
  testId,
}: {
  items: { key: string; label: string; value: number; display?: string }[];
  emptyLabel: string;
  testId?: string;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {items.map((item) => (
        <li
          key={item.key}
          className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate" title={item.label}>
            {item.label}
          </span>
          <span className="h-2 rounded-r bg-muted" aria-hidden>
            <span
              className="block h-2 rounded-r bg-chart-1"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-muted-foreground tabular-nums">{item.display ?? item.value}</span>
        </li>
      ))}
    </ul>
  );
}
