export const state = {
  chess: new Chess(),
  repertoires: [],
  activeRepIndex: -1,
  selectedSq: null,
  menuTarget: null,
  contextMenuMove: null,
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
    sortBy: 'frequency',
    candidatesOpen: true
  },
  deleteTargetIdx: -1,
  pendingDeleteType: '',
  _suppressSync: false,  // true pendant les imports PGN en masse (évite O(n) sérialisations)
  trainingActive: false,
  trainingRoot: null,
  trainingRepColor: null,
  trainingMode: 'vertical',
  trainingLabel: '',  // ex: "Gambit Dame › Défense Slave"
  trainingVisited: new Set(),
  trainingIgnoredNoReply: new Set(), // lignes ignorées (pas de réponse du joueur)
  trainingAnswered: new Set(),  // positions où le joueur a déjà correctement répondu
  trainingSkippedByError: new Set(), // positions sautées (mode survie)
  trainingCompletedTargets: new Set(), // positions joueur traitées (correctes ou sautées)
  trainingExpectedChildId: null,
  trainingTotalTargets: 0,
  trainingSurvivalLives: 3,
  trainingSurvivalMaxLives: 3,
  trainingSurvivalGoldenHeart: false, // vie bonus dorée (au-delà de 3)
  trainingSurvivalMilestones: 0,      // nb de fois où on a gagné une vie (+1 par tranche de 20 coups)
  trainingSurvivalMistakes: [], // [{ nodeId, fen, path, expectedSan, playedSan, nodeTurn }]
  trainingLastSurvivalReport: null,
  trainingLastVictoryReport: null,
  trainingFeedback: null,   // { type: 'correct'|'wrong'|'retry', from: sq, to: sq }
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

  // ── Dossiers de répertoires/variantes ────────────────────────────────
  // { [folderId: string]: folderName: string }
  repFolders: {},
  // Sélection temporaire lors de la création d'un répertoire
  pendingNewRepFolderId: null,   // string folderId | '__new__' | null
  pendingNewRepFolderName: null, // nom du nouveau dossier si '__new__'

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
