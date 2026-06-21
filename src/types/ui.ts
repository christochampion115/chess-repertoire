import type { TrainingMode, SurvivalReport } from './training';

/**
 * Discriminated union de toutes les modales de l'application.
 * null = aucune modale ouverte.
 */
export type ActiveModal =
  | { type: 'new-repertoire' }
  | { type: 'rename'; itemId: string }
  | { type: 'training-confirm'; rootId: string; mode: TrainingMode }
  | { type: 'training-interrupt'; title: string; message: string; onConfirm: () => void }
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
  | null;

export interface OpenPanels {
  repertoire: boolean;
  arbre: boolean;
}
