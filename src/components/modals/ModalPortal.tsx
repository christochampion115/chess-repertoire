import { useUiStore } from '@/stores/uiStore';
import { NewRepModal } from './NewRepModal';
import { NameVarModal } from './NameVarModal';
import { CommentModal } from './CommentModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { BoardThemeModal } from './BoardThemeModal';
import { RenameFolderModal } from './RenameFolderModal';
import { FolderGroupModal } from './FolderGroupModal';
import { HomeTrainingModal } from './HomeTrainingModal';
import { TrainingConfirmModal } from './TrainingConfirmModal';
import { TrainingInterruptModal } from './TrainingInterruptModal';
import { TrainingStopModal } from './TrainingStopModal';
import { TrainingDoneModal } from './TrainingDoneModal';
import { TrainingVictoryModal } from './TrainingVictoryModal';
import { TrainingDefeatModal } from './TrainingDefeatModal';
import { AccountModal } from './AccountModal';
import { AuthModal } from './AuthModal';
import { ProfileModal } from './ProfileModal';
import { PlayerStatsModal } from './PlayerStatsModal';
import { MedalsModal } from './MedalsModal';
import { AnnotationModal } from './AnnotationModal';
import { PatchNotesModal } from './PatchNotesModal';
import { SelectRepModal } from './SelectRepModal';

const modalComponents: Record<string, React.FC> = {
  'new-repertoire': NewRepModal,
  'rename': NewRepModal,
  'name-variant': NameVarModal,
  'comment': CommentModal,
  'delete-confirm': ConfirmDeleteModal,
  'board-theme': BoardThemeModal,
  'rename-folder': RenameFolderModal,
  'folder-group': FolderGroupModal,
  'home-training': HomeTrainingModal,
  'training-confirm': TrainingConfirmModal,
  'training-interrupt': TrainingInterruptModal,
  'training-stop': TrainingStopModal,
  'training-done': TrainingDoneModal,
  'training-victory': TrainingVictoryModal,
  'training-defeat': TrainingDefeatModal,
  'account': AccountModal,
  'auth': AuthModal,
  'profile': ProfileModal,
  'player-stats': PlayerStatsModal,
  'medals': MedalsModal,
  'annotation': AnnotationModal,
  'patch-notes': PatchNotesModal,
  'select-repertoire': SelectRepModal,
};

export function ModalPortal() {
  const modal = useUiStore((s) => s.activeModal);
  if (!modal) return null;
  const Cmp = modalComponents[modal.type];
  if (!Cmp) {
    console.warn(`[ModalPortal] Unknown modal type: ${modal.type}`);
    return null;
  }
  return <Cmp />;
}
