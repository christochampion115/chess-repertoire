import React from 'react';
import type { AnalysisLine } from '@/types/analysis';
import type { BoardTheme } from '@/types/chess';

// --- geometry helpers ---

type Coord = { cx: number; cy: number };

function sqToCoord(sq: string, flipped: boolean): Coord | null {
  if (sq.length < 2) return null;
  const file = sq.charCodeAt(0) - 97; // 'a'=0 … 'h'=7
  const rank = parseInt(sq[1] ?? '', 10) - 1; // '1'=0 … '8'=7
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return { cx: col + 0.5, cy: row + 0.5 };
}

function parseHexColor(hex: string): [number, number, number] {
  if (!hex || typeof hex !== 'string') return [100, 150, 80];
  const c = hex.replace('#', '').trim();
  if (c.length === 3) return [
    parseInt(c[0]! + c[0], 16),
    parseInt(c[1]! + c[1], 16),
    parseInt(c[2]! + c[2], 16),
  ];
  const n = parseInt(c.slice(0, 6), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Decreasing opacities matching the vanilla code
const OPACITIES = [1.0, 0.6, 0.4, 0.3, 0.2] as const;

// --- types ---

export interface EngineArrowsProps {
  results: AnalysisLine[];
  boardFlipped: boolean;
  arrowCount: number;
  boardTheme: BoardTheme;
  showArrows: boolean;
}

// --- component ---

export const EngineArrows = React.memo(function EngineArrows({
  results,
  boardFlipped,
  arrowCount,
  boardTheme,
  showArrows,
}: EngineArrowsProps) {
  const empty = (
    <svg
      id="engine-arrows-svg"
      viewBox="0 0 8 8"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );

  if (!showArrows || results.length === 0) return empty;

  const [Rr, Gg, Bb] = parseHexColor(boardTheme.dark);
  const R = Math.round(Rr * 0.6);
  const G = Math.round(Gg * 0.6);
  const B = Math.round(Bb * 0.6);
  const rgb = `rgb(${R},${G},${B})`;

  const count = Math.min(arrowCount, results.length);
  const gradDefs: React.ReactNode[] = [];
  const arrows: React.ReactNode[] = [];

  for (let i = 0; i < count; i++) {
    const line = results[i];
    if (!line) continue;
    const uci = line.uci;
    if (!uci || uci.length < 4) continue;

    const fc = sqToCoord(uci.slice(0, 2), boardFlipped);
    const tc = sqToCoord(uci.slice(2, 4), boardFlipped);
    if (!fc || !tc) continue;

    const dx = tc.cx - fc.cx;
    const dy = tc.cy - fc.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) continue;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const opacity = OPACITIES[i] ?? 0.12;
    const shaftW = 0.13;
    const headW  = 0.30;
    const headLen = 0.40;
    const tailGap = 0.28;
    const tipGap  = 0.12;

    const ax = fc.cx + ux * tailGap;
    const ay = fc.cy + uy * tailGap;
    const tx = tc.cx - ux * tipGap;
    const ty = tc.cy - uy * tipGap;
    const hx = tx - ux * headLen;
    const hy = ty - uy * headLen;

    const gradId = `eag-${i}`;
    gradDefs.push(
      <linearGradient
        key={gradId}
        id={gradId}
        gradientUnits="userSpaceOnUse"
        x1={ax.toFixed(4)} y1={ay.toFixed(4)}
        x2={tx.toFixed(4)} y2={ty.toFixed(4)}
      >
        <stop offset="0"    stopColor={rgb} stopOpacity="0" />
        <stop offset="0.38" stopColor={rgb} stopOpacity={opacity} />
        <stop offset="1"    stopColor={rgb} stopOpacity={opacity} />
      </linearGradient>,
    );

    // 7-point arrow polygon: shaft tail L/R → shaft-head junction L/R → head L/R → tip
    const pts = [
      [ax + nx * shaftW, ay + ny * shaftW],
      [hx + nx * shaftW, hy + ny * shaftW],
      [hx + nx * headW,  hy + ny * headW],
      [tx, ty],
      [hx - nx * headW,  hy - ny * headW],
      [hx - nx * shaftW, hy - ny * shaftW],
      [ax - nx * shaftW, ay - ny * shaftW],
    ]
      .map((pt) => `${(pt[0] as number).toFixed(4)},${(pt[1] as number).toFixed(4)}`)
      .join(' ');

    arrows.push(
      <polygon key={i} points={pts} fill={`url(#${gradId})`} />,
    );
  }

  return (
    <svg
      id="engine-arrows-svg"
      viewBox="0 0 8 8"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>{gradDefs}</defs>
      {arrows}
    </svg>
  );
});
