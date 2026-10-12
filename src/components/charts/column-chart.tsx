type Datum = { key: string; label: string; value: number };

const WIDTH = 720;
const HEIGHT = 180;
const TOP = 16;
const BOTTOM = 22;
const GAP = 2;
const RADIUS = 4;

/** Column with only the data end (top) rounded, anchored flat on the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Single-series column chart (inline SVG, one sequential hue). Each column has
 * a native tooltip and a hover highlight; a table view sits underneath.
 */
export function ColumnChart({
  data,
  title,
  tableLabel,
  valueLabel,
}: {
  data: Datum[];
  title: string;
  tableLabel: string;
  valueLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = WIDTH / Math.max(1, data.length);
  const barWidth = Math.max(2, slot - GAP);
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="group/chart h-auto w-full"
        role="img"
        aria-label={title}
        data-testid="column-chart"
      >
        <line x1={0} x2={WIDTH} y1={TOP} y2={TOP} className="stroke-chart-grid" strokeWidth={1} />
        <text x={0} y={TOP - 4} className="fill-muted-foreground text-[10px]">
          {max}
        </text>
        {data.map((d, i) => {
          const h = (d.value / max) * plotHeight;
          const x = i * slot + GAP / 2;
          return (
            <g
              key={d.key}
              className="transition-opacity group-hover/chart:opacity-40 hover:!opacity-100"
            >
              {/* Hit target: the full column slot, larger than the mark. */}
              <rect x={i * slot} y={TOP} width={slot} height={plotHeight} fill="transparent">
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
              {d.value > 0 ? (
                <path
                  d={columnPath(x, TOP + plotHeight - h, barWidth, h)}
                  className="pointer-events-none fill-chart-1"
                />
              ) : null}
              {i % labelEvery === 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <line
          x1={0}
          x2={WIDTH}
          y1={TOP + plotHeight}
          y2={TOP + plotHeight}
          className="stroke-chart-axis"
          strokeWidth={1}
        />
      </svg>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">{tableLabel}</summary>
        <table className="mt-2 w-full max-w-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-normal" />
              <th className="text-right font-normal">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.key}</td>
                <td className="text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
