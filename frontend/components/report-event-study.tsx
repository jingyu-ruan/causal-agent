"use client";
type UnknownRecord = Record<string, unknown>;
const finite = (v: unknown): number | null =>
  v !== null && v !== undefined && Number.isFinite(Number(v))
    ? Number(v)
    : null;
const text = (v: unknown, fallback = "—") => (v == null ? fallback : String(v));
export function EventStudyChart({
  points,
  confidence = 95,
}: {
  points: UnknownRecord[];
  confidence?: number;
}) {
  const chartPoints = points.map((point, index) => ({
    index,
    relative: finite(point.relative_period) ?? index,
    label: text(point.relative_period, String(index)),
    time: text(point.time_value, String(index)),
    effect: finite(point.effect) ?? 0,
    lower: finite(point.ci_lower),
    upper: finite(point.ci_upper),
    reference: point.is_reference === true,
  }));
  if (chartPoints.length < 2)
    return (
      <p className="mt-5 text-sm text-muted-foreground">
        Event-study points are not sufficient to draw the method view.
      </p>
    );

  const values = chartPoints
    .flatMap((point) => [point.effect, point.lower, point.upper])
    .filter((value): value is number => value !== null);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const padding = Math.max((rawMax - rawMin) * 0.16, 0.1);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const width = 760;
  const height = 280;
  const left = 50;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index: number) =>
    left + (index / Math.max(chartPoints.length - 1, 1)) * chartWidth;
  const y = (value: number) =>
    top + ((max - value) / (max - min)) * chartHeight;
  const zeroY = y(0);
  const referenceIndex = chartPoints.findIndex((point) => point.reference);
  const ticks = [min, 0, max];

  return (
    <div className="mt-5 overflow-x-auto" aria-label="Event study chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[42rem] text-slate-950 dark:text-slate-100"
        role="img"
        aria-label="Event study effects by relative period"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.35 : 0.1}
              strokeDasharray={tick === 0 ? undefined : "3 5"}
            />
            <text
              x={left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-current tabular-nums text-[14px]"
              opacity="0.55"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {referenceIndex >= 0 && (
          <line
            x1={x(referenceIndex)}
            x2={x(referenceIndex)}
            y1={top}
            y2={height - bottom}
            stroke="currentColor"
            strokeOpacity="0.22"
            strokeDasharray="4 5"
          />
        )}
        <line
          x1={left}
          x2={width - right}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity="0.45"
        />
        {chartPoints.map((point) => {
          const pointX = x(point.index);
          const pointY = y(point.effect);
          return (
            <g key={`${point.time}-${point.index}`}>
              {point.lower !== null && point.upper !== null && (
                <>
                  <line
                    x1={pointX}
                    x2={pointX}
                    y1={y(point.lower)}
                    y2={y(point.upper)}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeOpacity="0.55"
                  />
                  <line
                    x1={pointX - 4}
                    x2={pointX + 4}
                    y1={y(point.lower)}
                    y2={y(point.lower)}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeOpacity="0.55"
                  />
                  <line
                    x1={pointX - 4}
                    x2={pointX + 4}
                    y1={y(point.upper)}
                    y2={y(point.upper)}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeOpacity="0.55"
                  />
                </>
              )}
              <circle
                cx={pointX}
                cy={pointY}
                r={point.reference ? 5 : 4}
                fill={point.reference ? "currentColor" : "#38bdf8"}
                stroke="currentColor"
                strokeWidth={point.reference ? 2 : 1.5}
              />
              <text
                x={pointX}
                y={height - 20}
                textAnchor="middle"
                className="fill-current tabular-nums text-[14px]"
                opacity="0.65"
              >
                {point.label}
              </text>
            </g>
          );
        })}
        <text
          x={left}
          y={height - 3}
          className="fill-current tabular-nums text-[14px]"
          opacity="0.5"
        >
          pre
        </text>
        <text
          x={width - right}
          y={height - 3}
          textAnchor="end"
          className="fill-current tabular-nums text-[14px]"
          opacity="0.5"
        >
          post
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 tabular-nums text-[14px] text-muted-foreground">
        <span>Relative period</span>
        <span>● estimate</span>
        <span>vertical bar {confidence}% CI</span>
        <span>
          reference ={" "}
          {chartPoints.find((point) => point.reference)?.label ?? "—"}
        </span>
      </div>
    </div>
  );
}
