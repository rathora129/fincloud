"use client";

import { useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { formatINR, formatINRCompact, formatNumber } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

ChartJS.defaults.font.family =
  'var(--font-inter), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = "#5d7a88";

const grid = {
  color: "rgba(19, 35, 44, 0.06)",
  drawTicks: false,
};

const baseOptions = (currency: boolean): ChartOptions<"line"> => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#071c27",
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      titleFont: { size: 11, weight: 600 },
      bodyFont: { size: 12 },
      callbacks: {
        label: (context) => (currency ? formatINR(context.parsed.y) : formatNumber(context.parsed.y)),
      },
    },
  },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0 } },
    y: {
      grid,
      border: { display: false },
      beginAtZero: true,
      ticks: {
        maxTicksLimit: 5,
        callback: (value) => (currency ? formatINRCompact(Number(value)) : formatNumber(Number(value))),
      },
    },
  },
});

export function AreaTrend({
  labels,
  values,
  color = "#117a60",
  height = 220,
  currency = false,
  label = "Value",
  fill = true,
}: {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  currency?: boolean;
  label?: string;
  fill?: boolean;
}) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: color,
          backgroundColor: fill ? "rgba(17, 122, 96, 0.10)" : "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
          tension: 0.38,
          fill,
        },
      ],
    }),
    [labels, values, color, fill, label],
  );

  return (
    <div style={{ height }}>
      <Line data={data} options={baseOptions(currency)} aria-label={`${label} trend chart`} />
    </div>
  );
}

export function GroupedBars({
  labels,
  series,
  height = 230,
  currency = false,
}: {
  labels: string[];
  series: { label: string; values: number[]; color: string }[];
  height?: number;
  currency?: boolean;
}) {
  const data = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.values,
      backgroundColor: s.color,
      borderRadius: 5,
      maxBarThickness: 18,
    })),
  };
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", padding: 16 },
      },
      tooltip: {
        backgroundColor: "#071c27",
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${currency ? formatINR(context.parsed.y) : formatNumber(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: {
        grid,
        border: { display: false },
        beginAtZero: true,
        ticks: {
          maxTicksLimit: 5,
          callback: (value) => (currency ? formatINRCompact(Number(value)) : formatNumber(Number(value))),
        },
      },
    },
  };
  return (
    <div style={{ height }}>
      <Bar data={data} options={options} aria-label="Grouped bar chart" />
    </div>
  );
}

const PALETTE = ["#117a60", "#47b28c", "#7ccdae", "#c9a227", "#8099a5"];

export function DonutChart({
  labels,
  values,
  height = 220,
  currency = false,
}: {
  labels: string[];
  values: number[];
  height?: number;
  currency?: boolean;
}) {
  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: PALETTE,
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "66%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", padding: 12 },
      },
      tooltip: {
        backgroundColor: "#071c27",
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) =>
            `${context.label}: ${currency ? formatINR(Number(context.parsed)) : formatNumber(Number(context.parsed))}`,
        },
      },
    },
  };
  return (
    <div style={{ height }}>
      <Doughnut data={data} options={options} aria-label="Donut chart" />
    </div>
  );
}

export function FunnelChart({
  stages,
  height = 230,
}: {
  stages: { stage: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="flex flex-col justify-center gap-3" style={{ height }}>
      {stages.map((stage, index) => {
        const width = Math.max(6, (stage.value / max) * 100);
        const color = PALETTE[index % PALETTE.length];
        return (
          <div key={stage.stage} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium capitalize text-ink-600">{stage.stage.toLowerCase()}</span>
              <span className="tabular font-semibold text-ink-900">{formatNumber(stage.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
