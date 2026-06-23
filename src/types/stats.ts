export type StatsDatabase = 'lichess' | 'masters' | 'player';
export type StatsSortBy = 'frequency' | 'winrate' | 'winrate-white' | 'winrate-black' | 'engine';
export type PlayerTimeClass = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';

/** 'white' | 'black' — différent de Color ('w' | 'b') utilisé pour l'échiquier */
export type PlayerColor = 'white' | 'black';

export interface StatsFilters {
  eloPanelOpen: boolean;
  sortPanelOpen: boolean;
  eloMin: number;
  eloMax: number;
  currentDatabase: StatsDatabase;
  sortBy: StatsSortBy;
  candidatesOpen: boolean;
  playerUsername: string;
  playerColor: PlayerColor;
  playerTimeClass: PlayerTimeClass;
  playerDateFrom: string;
  playerDateTo: string;
  playerEloMin: number;
  playerEloMax: number;
}

export interface StatsMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export interface LichessStats {
  white: number;
  draws: number;
  black: number;
  moves: StatsMove[];
  topGames?: unknown[];
  recentGames?: unknown[];
  openingName?: string;
  eco?: string;
}

export interface SavedPlayerStats {
  cacheKey: string;
  filters: Pick<StatsFilters,
    | 'playerUsername'
    | 'playerColor'
    | 'playerTimeClass'
    | 'playerDateFrom'
    | 'playerDateTo'
    | 'playerEloMin'
    | 'playerEloMax'
  >;
  createdAt: string; // ISO date
}
