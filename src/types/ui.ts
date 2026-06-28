import type { TrainingMode, SurvivalReport } from './training';

/**
 * Discriminated union de toutes les modales de l'application.
 * null = aucune modale ouverte.
 */
export type ActiveModal =
  | { type: 'new-repertoire'; initialMode?: 'start' | 'current' | 'pgn-file' | 'pgn-text'; initialColor?: 'w' | 'b' }
  | { type: 'rename'; itemId: string }
  | { type: 'training-confirm'; rootId: string; mode: TrainingMode }
  | { type: 'training-interrupt'; title: string; message: string; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel?: () => void }
  | { type: 'training-stop' }
  | { type: 'training-done' }
  | { type: 'training-victory'; report: SurvivalReport }
  | { type: 'training-defeat'; report: SurvivalReport }
  | { type: 'comment'; nodeId: string }
  | { type: 'board-theme' }
  | { type: 'auth' }
  | { type: 'profile' }
  | { type: 'player-stats' }
  | { type: 'medals' }
  | { type: 'delete-confirm'; itemId: string; deleteType: string }
  | { type: 'name-variant'; nodeId: string }
  | { type: 'rename-folder'; folderId: string }
  | { type: 'account' }
  | { type: 'folder-group' }
  | { type: 'annotation' }
  | { type: 'patch-notes' }
  | { type: 'select-repertoire'; repChoices: { repIndex: number; nodeId: string; repName: string }[] }
  | null;

export interface OpenPanels {
  repertoire: boolean;
  arbre: boolean;
}
