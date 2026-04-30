export const state = {
  chess: new Chess(),
  repertoires: [],
  activeRepIndex: -1,
  selectedSq: null,
  menuTarget: null,
  redoStack: [],
  openPanels: {
    repertoire: false,
    arbre: false
  },
  boardFlipped: false,
  treeExpanded: new Set(),
  repExpanded: new Set(),
  selectedColor: 'w',
  contextMenuSource: '',
  varNameConflictConfirmed: false,
  sectionStates: { white: true, black: true },
  freePlayRoot: null,
  currentNode: null,
  lichessStats: null,
  lastStatsRequestKey: '',
  statsLoading: false,
  statsError: null,
  statsSelectedUci: '',
  statsShowAll: false,
  currentStatsRequestKey: '',
  pendingStatsRequest: null,
  statsEloMiniLoading: false,
  statsEloMiniLoaderUntil: 0,
  statsFilters: {
    eloPanelOpen: false,
    sortPanelOpen: false,
    eloMin: 0,
    eloMax: 3000,
    currentDatabase: 'lichess',  // 'lichess' | 'masters'
    sortBy: 'frequency'
  },
  deleteTargetIdx: -1,
  pendingDeleteType: '',
  trainingActive: false,
  trainingRoot: null,
  trainingRepColor: null,
  trainingMode: 'vertical',
  trainingLabel: '',  // ex: "Gambit Dame › Défense Slave"
  trainingVisited: new Set(),
  trainingIgnoredNoReply: new Set(), // lignes ignorées (pas de réponse du joueur)
  trainingAnswered: new Set(),  // positions où le joueur a déjà correctement répondu
  trainingFeedback: null,   // { type: 'correct'|'wrong', from: sq, to: sq }
  boardEl: null,
  ctxMenuEl: null,
  modalOverlayEl: null,
  boardTheme: {
  light: '#ebecd0',
  dark: '#779556'
},
  // Animation : { fromSq, toSq } à appliquer après le prochain render
  pendingAnimation: null,
  // Positionné à true par le drag pour sauter l'animation post-render
  skipNextAnimation: false,

  // ── Analyse Stockfish ────────────────────────────────────────────────────
  isAnalysisEnabled: false,
  analysisDepth: 10,
  analysisResults: [],
  analysisError: null,
  moveAnnotations: {},
  moveAnnotationScores: {},
  moveAnnotationValues: {},
  moveAnnotationPvs: {},
  moveAnnotationsKey: '',
  moveAnnotationsVisibleKey: '',
  moveAnnotationsDepth: 0,
  moveAnnotationsCount: 0,
  moveAnnotationsLoading: false,
  moveAnnotationsComplete: false,

  // ── Auth / session ───────────────────────────────────────────────────────
  auth: {
    mode: 'login',
    user: null,
    token: '',
    status: 'guest',
    error: '',
    isSubmitting: false,
    syncStatus: 'idle',
    syncMessage: ''
  },
  
  // ── Guest Mode ───────────────────────────────────────────────────────
  isGuestMode: false,
  userData: null,
  authMode: 'login',

  // ── DOM references (assignées au démarrage dans main.js) ─────────────
  dynamicModals: null

};

export function initState() {
  state.freePlayRoot = {
    id: 'free',
    fen: state.chess.fen(),
    children: [],
    parent: null,
    moveNum: 0,
    turn: 'b',
    san: 'Initial'
  };
  state.currentNode = state.freePlayRoot;
}
