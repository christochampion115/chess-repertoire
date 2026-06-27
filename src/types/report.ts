export type PlayerColor = 'white' | 'black';
export type PlayerTimeClass = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';

export interface ReportParams {
  username: string;
  color: PlayerColor;
  timeClass: PlayerTimeClass;
  dateFrom: string;
  dateTo: string;
  eloMin: number;
  eloMax: number;
  startFen: string;
  startPath: string;
}

export interface ReportItem {
  contextPath: string[];
  playerMove: string;
  playerUci: string;
  fenBefore: string;
  fenAfter: string;
  depth: number;
  moveNumber: number;
  total: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  gap: number;           // signé : baselineScore - score (négatif = meilleur que la moyenne)
  impactElo: number;     // 100 × (total/scopedGames) × (16 × score − 8)
  posTotal: number;
}

export interface ReportData {
  totalGames: number;
  parsedGames: number;
  filteredGames: number;
  truncated: boolean;
  baselineScore: number;
  rootFen: string;
  positionFiltered: boolean;
  items: ReportItem[];
  groups?: ReportGroup[];       // free mode only
  honorables?: ReportItem[];    // free mode only
}

export interface ReportGroup {
  key: string;
  children: ReportItem[];
  total: number;
  wins: number;
  draws: number;
  losses: number;
  impactElo: number;
  fen: string | null;
  fenUci: string | null;
  groupScore: number;
  groupGap: number;
  problematicLines: ReportItem[];
  compensatingLines: ReportItem[];
}

export interface ReportProgress {
  type: 'archive' | 'phase';
  current?: number;
  total?: number;
  gamesInArchive?: number;
  cumulative?: number;
  phase?: 'position-map' | 'scoring' | 'complete';
  positions?: number;
  depth?: number;
  maxDepth?: number;
}

export interface ReportSSEComplete {
  type: 'complete';
  data: ReportData;
}

export interface ReportSSEError {
  type: 'error';
  error: string;
}

export type ReportSSEEvent = ReportProgress | ReportSSEComplete | ReportSSEError;

export interface SavedReportMeta {
  id: number;
  params: ReportParams;
  totalGames: number;
  baselineScore: number;
  createdAt: string;
}

export interface PriorityBadge {
  badgeClass: 'badge-critical' | 'badge-important' | 'badge-minor';
  itemClass: 'report-item--critical' | 'report-item--important' | 'report-item--minor';
  label: 'CRITIQUE' | 'IMPORTANT' | 'MINEUR';
  rank: 3 | 2 | 1;
}
