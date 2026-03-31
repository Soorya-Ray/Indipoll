export default function ForecastChart({ station }) {
  const { values, upper, lower } = station.forecast;
  const width = 780;
  const height = 320;
  const padding = { top: 24, right: 20, bottom: 34, left: 42 };
  const max = Math.max(...upper) + 20;
  const min = Math.max(0, Math.min(...lower) - 20);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const labels = ["Now", "6h", "12h", "18h", "24h", "30h", "36h", "42h", "48h", "54h", "60h", "72h"];

  const x = (index) => padding.left + (index / (values.length - 1)) * plotWidth;
  const y = (value) => padding.top + (1 - (value - min) / (max - min)) * plotHeight;

  const areaPath = upper
    .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`)
    .concat(lower.slice().reverse().map((value, index) => `L ${x(values.length - 1 - index)} ${y(value)}`))
    .join(" ");

  const linePath = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const ticks = [min, Math.round((min + max) / 2), max];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="forecast-chart" aria-label={`${station.city} AQI forecast chart`}>
      <rect x="0" y="0" width={width} height={height} rx="24" fill="var(--chart-bg)" />
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--chart-grid)"
            strokeDasharray="4 6"
          />
          <text x="8" y={y(tick) + 4} fill="var(--chart-axis-text)" fontSize="12">
            {tick}
          </text>
        </g>
      ))}
      {labels.map((label, index) => (
        <text key={label} x={x(index)} y={height - 10} textAnchor="middle" fill="var(--chart-axis-text)" fontSize="12">
          {label}
        </text>
      ))}
      <path d={`${areaPath} Z`} fill="var(--chart-band-fill)" />
      <path d={linePath} fill="none" stroke="var(--chart-line)" strokeWidth="4" strokeLinecap="round" />
      {values.map((value, index) => (
        <circle
          key={`${index}-${value}`}
          cx={x(index)}
          cy={y(value)}
          r="5"
          fill={index === 0 ? "var(--chart-point-current)" : "var(--chart-point)"}
        />
      ))}
      <text x={padding.left} y="14" fill="var(--chart-title)" fontSize="14" fontWeight="700">
        {station.city} forecast · {station.forecastMode === "live" ? "Connected" : "LSTM-style fallback"} confidence band
      </text>
    </svg>
  );
}
