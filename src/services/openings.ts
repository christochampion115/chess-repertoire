import type { ReportItem, ReportParams, PlayerColor } from '@/types/report';

interface OpeningEntry {
  s: string;
  n: string;
  e: string;
}

interface OpeningsData {
  count: number;
  openings: OpeningEntry[];
}

let OPENINGS: OpeningEntry[] | null = null;

export async function ensureOpeningsLoaded(): Promise<void> {
  if (OPENINGS) return;
  const res = await fetch('data/openings.json');
  if (!res.ok) throw new Error(`Impossible de charger les ouvertures (${res.status})`);
  const data: OpeningsData = await res.json();
  OPENINGS = data.openings;
}

function pathToString(path: string[]): string {
  return path.join(' ');
}

export function lookupEco(path: string[]): string | null {
  if (!OPENINGS) return null;
  const str = pathToString(path);
  for (const entry of OPENINGS) {
    if (str.startsWith(entry.s) || str === entry.s) return entry.n;
  }
  return null;
}

export function getMoveNumberFromFen(fen?: string): number {
  if (!fen) return 1;
  const parts = fen.split(' ');
  return parseInt(parts[parts.length - 1], 10) || 1;
}

interface RepertoireInfo {
  name?: string;
  fen?: string;
}

export function getOpeningName(item: ReportItem, repertoires?: RepertoireInfo[]): string {
  const fullPath = [...item.contextPath, item.playerMove];

  if (Array.isArray(repertoires)) {
    for (const rep of repertoires) {
      if (rep?.name) {
        const repFen = rep.fen ? rep.fen.split(' ')[0] : null;
        const beforeFen = item.fenBefore ? item.fenBefore.split(' ')[0] : null;
        if (repFen && beforeFen && repFen === beforeFen) return rep.name;
      }
    }
  }

  if (fullPath.length >= 3) {
    const eco = lookupEco(fullPath);
    if (eco) return eco;
  }

  const parentEco = lookupEco(item.contextPath);
  if (parentEco && item.playerMove) {
    return `${parentEco} : ${item.playerMove}`;
  }

  if (fullPath.length > 0) return `1.${fullPath[0]}…`;
  return 'Position initiale';
}

export function getOpeningNameByPath(
  fullPath: string[],
  fenBefore?: string,
  repertoires?: RepertoireInfo[]
): string {
  if (Array.isArray(repertoires)) {
    for (const rep of repertoires) {
      if (rep?.name) {
        const repFen = rep.fen ? rep.fen.split(' ')[0] : null;
        const beforeFen = fenBefore ? fenBefore.split(' ')[0] : null;
        if (repFen && beforeFen && repFen === beforeFen) return rep.name;
      }
    }
  }

  if (fullPath.length >= 1) {
    const eco = lookupEco(fullPath);
    if (eco) return eco;
  }

  const parentEco = lookupEco(fullPath.slice(0, -1));
  if (parentEco && fullPath.length > 0) {
    return `${parentEco} : ${fullPath[fullPath.length - 1]}`;
  }
  if (fullPath.length > 0) return `1.${fullPath[0]}…`;
  return 'Position initiale';
}

export function pathToPgn(path: string[], highlightLast = false, startMove = 1): string {
  let html = '';
  for (let i = 0; i < path.length; i++) {
    if (i % 2 === 0) {
      html += `<span class="pgn-movenum">${startMove + Math.floor(i / 2)}.</span>`;
    }
    const isLast = i === path.length - 1;
    const cls = (isLast && highlightLast) ? ' class="pgn-player-move"' : '';
    html += `<span${cls}>${path[i]}</span> `;
  }
  return html.trimEnd();
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const METRIC_HELP: Record<string, string> = {
  foundGames: 'Nombre de parties qui correspondent aux filtres choisis et, si une position de départ est définie, qui atteignent réellement cette position.',
  analyzedGames: 'Nombre de parties effectivement utilisées pour comparer les lignes. Ici il correspond au sous-ensemble retenu pour le rapport.',
  baselineScore: 'Score moyen du joueur sur cet échantillon. Une victoire vaut 1, une nulle vaut 0,5, une défaite vaut 0.',
  lineScore: 'Score moyen obtenu dans cette ligne précise sur les parties de l\'échantillon.',
  gap: 'Différence entre le score global et le score de cette ligne. Plus l\'écart est grand, plus la ligne sous-performe.',
  avoidable: 'Impact Elo estimé sur 100 parties : plus la valeur est négative, plus la ligne vous coûte des points Elo. Formule : 100 × fréquence × (16 × winRate − 8).',
};

export function renderMetricLabel(label: string, helpText: string): string {
  return `<span class="metric-help">${label}<span class="metric-help-icon">i</span><span class="metric-help-bubble">${escapeHtml(helpText)}</span></span>`;
}

export const FORMAT_LABELS = {
  timeClass: (value: string): string => {
    const map: Record<string, string> = {
      all: 'toutes cadences',
      bullet: 'bullet',
      blitz: 'blitz',
      rapid: 'rapide',
      classical: 'classique',
      daily: 'correspondance',
    };
    return map[value] || value || 'toutes cadences';
  },
  color: (value: PlayerColor): string => value === 'black' ? 'Noirs' : 'Blancs',
  monthRange: (value?: string): string => {
    if (!value) return 'origine';
    const [year, month] = value.split('/');
    const labels = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const index = Number.parseInt(month, 10) - 1;
    if (index < 0 || index > 11 || !year) return value;
    return `${labels[index]} ${year}`;
  },
  elo: (min: number, max: number): string => {
    if (min > 0 && max < 3000) return `${min}-${max} Elo`;
    if (min > 0) return `>= ${min} Elo`;
    if (max < 3000) return `<= ${max} Elo`;
    return 'tous Elo';
  },
};

export function summarizeParams(params: ReportParams, data: { positionFiltered?: boolean }): string {
  const parts = [
    `parties de ${params.username}`,
    FORMAT_LABELS.color(params.color),
    `en ${FORMAT_LABELS.timeClass(params.timeClass)}`,
  ];

  if (params.dateFrom || params.dateTo) {
    const from = FORMAT_LABELS.monthRange(params.dateFrom || '');
    const to = FORMAT_LABELS.monthRange(params.dateTo || '');
    parts.push(`de ${from || 'origine'} à ${to || "aujourd'hui"}`);
  }

  parts.push(`contre ${FORMAT_LABELS.elo(params.eloMin, params.eloMax)}`);
  if (data.positionFiltered) parts.push('depuis la position sélectionnée');

  return parts.join(' · ');
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
