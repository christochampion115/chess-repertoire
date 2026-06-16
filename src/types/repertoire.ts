import type { Color } from './chess';
import type { MedalTier } from './training';

export type { MedalTier };

/**
 * Nœud de l'arbre de répertoire.
 *
 * IMPORTANT : `parentId` remplace la référence circulaire `parent: RepertoireNode`.
 * Ne jamais stocker de référence récursive vers le parent — non-sérialisable JSON.
 */
export interface RepertoireNode {
  id: string;
  san: string;
  fen: string;
  /** null uniquement pour les racines de répertoire */
  parentId: string | null;
  children: RepertoireNode[];
  moveNum: number;
  turn: Color;
  comment?: string;
  varName?: string;
  varAnnotation?: string;
  annotation?: string;
  isTransposition?: boolean;
  /** ID du nœud source si transposition */
  sourceNodeId?: string | null;
  folderId?: string;
  trainingMedalTier?: MedalTier;
  trainingMedalShineLevel?: number;
  trainingMedalUpdatedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  isExample?: boolean;
  /** Champs présents uniquement sur les nœuds racine */
  name?: string;
  color?: Color;
}

/** { folderId: folderName } */
export type RepFolders = Record<string, string>;
