import type { Color, PieceType } from '@/types/chess';

// Paths from boardUtils.js – WIKI_PIECES
const WIKI_PATH: Record<string, string> = {
  wp: '4/45/Chess_plt45.svg',
  wr: '7/72/Chess_rlt45.svg',
  wn: '7/70/Chess_nlt45.svg',
  wb: 'b/b1/Chess_blt45.svg',
  wq: '1/15/Chess_qlt45.svg',
  wk: '4/42/Chess_klt45.svg',
  bp: 'c/c7/Chess_pdt45.svg',
  br: 'f/ff/Chess_rdt45.svg',
  bn: 'e/ef/Chess_ndt45.svg',
  bb: '9/98/Chess_bdt45.svg',
  bq: '4/47/Chess_qdt45.svg',
  bk: 'f/f0/Chess_kdt45.svg',
};

const BASE_URL = 'https://upload.wikimedia.org/wikipedia/commons/';

export function getPieceUrl(color: Color, type: PieceType): string {
  const path = WIKI_PATH[color + type];
  return path ? BASE_URL + path : '';
}
