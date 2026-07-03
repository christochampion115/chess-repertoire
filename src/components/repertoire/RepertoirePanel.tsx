import React, { useMemo, useCallback, useState } from 'react';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useUiStore } from '@/stores/uiStore';
import type { RepertoireNode } from '@/types/repertoire';
import * as repertoireService from '@/services/repertoire';
import { buildContextMenu } from '@/services/contextMenu';
import { prepareTraining, setPendingTrainingMode, getMedalDisplayMeta } from '@/services/training';
import { ANNOTATION_STYLE } from '@/utils/annotationStyle';

// ─── Helpers ───────────────────────────────────────────────────────────────

function countPlayerMoves(node: RepertoireNode, repColor: string): number {
  let count = 0;
  function walkCount(n: RepertoireNode) {
    for (const child of n.children) {
      if (!child.isTransposition) {
        if (n.turn === repColor) count += 1;
      }
      walkCount(child);
    }
  }
  walkCount(node);
  return count;
}

function hasNamedDescendants(node: RepertoireNode): boolean {
  return node.children.some((c) => c.varName || hasNamedDescendants(c));
}

function isDescendantOf(ancestorId: string, nodeId: string | null): boolean {
  if (!nodeId) return false;
  let cur = repertoireService.getNode(nodeId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    if (!cur.parentId) break;
    cur = repertoireService.getNode(cur.parentId);
  }
  return false;
}

function collectFolderMembers(root: RepertoireNode, folderId: string): RepertoireNode[] {
  const result: RepertoireNode[] = [];
  function walk(n: RepertoireNode) {
    for (const c of n.children) {
      if (c.varName && c.folderId === folderId) result.push(c);
      else if (!c.varName) walk(c);
    }
  }
  walk(root);
  return result;
}

// ─── VariantItem ──────────────────────────────────────────────────────────

interface VariantItemProps {
  node: RepertoireNode;
  depth: number;
  repColor: string;
  repRoot: RepertoireNode;
  repExpanded: Set<string>;
  toggleRepExpanded: (id: string) => void;
  currentNodeId: string | null;
}

function VariantItem({
  node, depth, repColor, repRoot, repExpanded, toggleRepExpanded, currentNodeId,
}: VariantItemProps) {
  const moveCount = useMemo(() => countPlayerMoves(node, repColor), [node, repColor]);
  const hasChildren = hasNamedDescendants(node);
  const isExpanded = repExpanded.has(node.id);
  const isActive = currentNodeId != null && isDescendantOf(node.id, currentNodeId);
  const medalMeta = useMemo(() => getMedalDisplayMeta(node), [node]);

  const handleContext = useCallback((e: React.MouseEvent) => {
    buildContextMenu(e, 'repertoire_subitem', node);
  }, [node]);

  const handleTrain = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    prepareTraining(node, repColor);
    setPendingTrainingMode('vertical');
    useUiStore.getState().openModal({ type: 'training-confirm', rootId: node.id, mode: 'vertical' });
  }, [node, repColor]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRepExpanded(node.id);
  }, [node.id, toggleRepExpanded]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    repertoireService.navigateToNode(node.id);
  }, [node.id]);

  return (
    <>
      <div
        className={`sub-var-item${isActive ? ' active' : ''}`}
        style={{ marginLeft: depth * 15 }}
        onClick={handleClick}
        onContextMenu={handleContext}
      >
        <div className="sub-var-main">
          {hasChildren && (
            <div className="tree-toggle" onClick={handleToggle}>
              {isExpanded ? '−' : '+'}
            </div>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            {node.varName}
            {node.varAnnotation && (
              <span className="annotation-tag" style={{ color: ANNOTATION_STYLE[node.varAnnotation]?.color }}>{node.varAnnotation}</span>
            )}
          </span>
          {medalMeta && (
            <span className={`rep-medal-badge tier-${medalMeta.tier}`} data-shine={medalMeta.shine} title={`${medalMeta.label} · niveau ${medalMeta.shine + 1}`}>
              {medalMeta.icon}
            </span>
          )}
        </div>
        <button className="train-btn" onClick={handleTrain}>
          S'entraîner ({moveCount} coups)
        </button>
      </div>
      {hasChildren && isExpanded && (
        <VariantTree
          node={node}
          depth={depth + 1}
          repColor={repColor}
          repRoot={repRoot}
          repExpanded={repExpanded}
          toggleRepExpanded={toggleRepExpanded}
          currentNodeId={currentNodeId}
        />
      )}
    </>
  );
}

// ─── VariantTree — recursive walker for niveaux 3-4-5-6+ ────────────────

interface VariantTreeProps {
  node: RepertoireNode;
  depth: number;
  repColor: string;
  repRoot: RepertoireNode;
  repExpanded: Set<string>;
  toggleRepExpanded: (id: string) => void;
  repFolders?: Record<string, string>;
  currentNodeId: string | null;
}

function VariantTree({
  node, depth, repColor, repRoot, repExpanded, toggleRepExpanded, repFolders, currentNodeId,
}: VariantTreeProps) {
  const storeFolders = useRepertoireStore((s) => s.repFolders);
  const folders = repFolders ?? storeFolders;

  const rendered: React.ReactNode[] = [];
  const processedFolderIds = new Set<string>();

  function walk(n: RepertoireNode) {
    for (const child of n.children) {
      if (!child.varName) {
        walk(child);
        continue;
      }

      const fid = child.folderId ?? '';
      const hasFolderDef = fid !== '' && folders[fid];

      if (hasFolderDef) {
        if (processedFolderIds.has(fid)) continue;
        processedFolderIds.add(fid);

        const members = collectFolderMembers(repRoot, fid);
        const folderKey = '__var_folder__' + fid;
        const isCollapsed = repExpanded.has(folderKey);

        rendered.push(
          <React.Fragment key={folderKey}>
            <div
              className="sub-var-item"
              style={{ marginLeft: depth * 15, cursor: 'default' }}
              onClick={() => toggleRepExpanded(folderKey)}
              onContextMenu={(e) => buildContextMenu(e, 'variant_folder', null, -1, fid)}
            >
              <div className="sub-var-main">
                <div className="tree-toggle">{isCollapsed ? '+' : '−'}</div>
                <span style={{ flex: 1, minWidth: 0 }}>📁 {folders[fid]}</span>
              </div>
            </div>
            {!isCollapsed && members.map((m) => (
              <VariantItem
                key={m.id}
                node={m}
                depth={depth + 1}
                repColor={repColor}
                repRoot={repRoot}
                repExpanded={repExpanded}
                toggleRepExpanded={toggleRepExpanded}
                currentNodeId={currentNodeId}
              />
            ))}
          </React.Fragment>,
        );
      } else {
        rendered.push(
          <VariantItem
            key={child.id}
            node={child}
            depth={depth}
            repColor={repColor}
            repRoot={repRoot}
            repExpanded={repExpanded}
            toggleRepExpanded={toggleRepExpanded}
            currentNodeId={currentNodeId}
          />,
        );
      }
    }
  }

  walk(node);

  return <>{rendered}</>;
}

// ─── RepItem ────────────────────────────────────────────────────────────────

interface RepItemProps {
  rep: RepertoireNode;
  idx: number;
  isActive: boolean;
  onClick: () => void;
  repExpanded: Set<string>;
  toggleRepExpanded: (id: string) => void;
  repFolders: Record<string, string>;
  currentNodeId: string | null;
}

function RepItem({
  rep, idx, isActive, onClick, repExpanded, toggleRepExpanded, repFolders, currentNodeId,
}: RepItemProps) {
  const moveCount = useMemo(() => countPlayerMoves(rep, rep.color ?? 'w'), [rep]);
  const hasVariants = hasNamedDescendants(rep);
  const medalMeta = useMemo(() => getMedalDisplayMeta(rep), [rep]);
  const isInSubVariant = useMemo(() => {
    if (!currentNodeId || currentNodeId === rep.id) return false;
    function walk(n: RepertoireNode): boolean {
      for (const child of n.children) {
        if (child.varName && isDescendantOf(child.id, currentNodeId)) return true;
        if (!child.varName && walk(child)) return true;
      }
      return false;
    }
    return walk(rep);
  }, [rep, currentNodeId]);

  const handleContext = useCallback((e: React.MouseEvent) => {
    buildContextMenu(e, 'repertoire_item', rep, idx);
  }, [rep, idx]);

  const handleTrain = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    prepareTraining(rep, rep.color ?? 'w');
    setPendingTrainingMode('vertical');
    useUiStore.getState().openModal({ type: 'training-confirm', rootId: rep.id, mode: 'vertical' });
  }, [rep]);

  return (
    <div
      className={`rep-item-wrapper${isActive && !isInSubVariant ? ' active' : ''}`}
      onClick={onClick}
      onContextMenu={handleContext}
    >
      <div className="rep-header">
        <div className="rep-row">
          <span style={{ fontSize: '1.1em' }}>
            {rep.color === 'b' ? '♚' : '♔'}
          </span>
          <span style={{ flex: 1 }}>
            {rep.name ?? rep.san ?? '(Sans nom)'}
          </span>
          {medalMeta && (
            <span
              className={`rep-medal-badge tier-${medalMeta.tier}`}
              data-shine={medalMeta.shine}
              title={`${medalMeta.label} · niveau ${medalMeta.shine + 1}`}
            >
              {medalMeta.icon}
            </span>
          )}
        </div>
        <div className="rep-train-row">
          <button className="train-btn" onClick={handleTrain}>
            S'entraîner ({moveCount} coups)
          </button>
        </div>
      </div>

      {hasVariants && (
        <div className="rep-sub-variants">
          <VariantTree
            node={rep}
            depth={0}
            repColor={rep.color ?? 'w'}
            repRoot={rep}
            repExpanded={repExpanded}
            toggleRepExpanded={toggleRepExpanded}
            repFolders={repFolders}
            currentNodeId={currentNodeId}
          />
        </div>
      )}
    </div>
  );
}

// ─── ColorSection ───────────────────────────────────────────────────────

function ColorSection({
  label,
  items,
  sectionKey,
  activeRepIndex,
  repExpanded,
  repFolders,
  toggleRepExpanded,
  currentNodeId,
}: {
  label: string;
  items: Array<{ rep: RepertoireNode; idx: number }>;
  sectionKey: string;
  activeRepIndex: number;
  repExpanded: Set<string>;
  repFolders: Record<string, string>;
  toggleRepExpanded: (id: string) => void;
  currentNodeId: string | null;
}) {
  const [open, setOpen] = useState(true);

  type FolderEntry = { name: string; reps: Array<{ rep: RepertoireNode; idx: number }> };
  const { folderMap, noFolder } = useMemo(() => {
    const map: Record<string, FolderEntry> = {};
    const plain: Array<{ rep: RepertoireNode; idx: number }> = [];
    items.forEach(({ rep, idx }) => {
      if (rep.folderId && repFolders[rep.folderId]) {
        if (!map[rep.folderId]) map[rep.folderId] = { name: repFolders[rep.folderId]!, reps: [] };
        map[rep.folderId]!.reps.push({ rep, idx });
      } else {
        plain.push({ rep, idx });
      }
    });
    return { folderMap: map, noFolder: plain };
  }, [items, repFolders]);

  return (
    <div className="rep-section">
      <div className="section-header" onClick={() => setOpen((v) => !v)}>
        <span>{label} ({items.length})</span>
        <span>{open ? '▼' : '▶'}</span>
      </div>
      <div className={`section-content${open ? ' open' : ''}`}>
        {Object.entries(folderMap).map(([folderId, { name, reps }]) => {
          const folderKey = `${sectionKey}__folder__${folderId}`;
          const isCollapsed = repExpanded.has(folderKey);
          return (
            <div key={folderId} className="rep-folder">
              <div
                className="rep-folder-header"
                onClick={() => toggleRepExpanded(folderKey)}
                onContextMenu={(e) => buildContextMenu(e, 'repertoire_folder', null, -1, folderId)}
              >
                <span style={{ marginRight: 6, fontSize: '0.75em' }}>{isCollapsed ? '▶' : '▼'}</span>
                📁 {name}
                <span style={{ marginLeft: 6, fontSize: '0.8em', color: 'var(--text-muted)' }}>({reps.length})</span>
              </div>
              {!isCollapsed && (
                <div className="rep-folder-body">
                  {reps.map(({ rep, idx }) => (
                    <RepItem
                      key={rep.id}
                      rep={rep}
                      idx={idx}
                      isActive={idx === activeRepIndex}
                      onClick={() => repertoireService.selectRepertoire(idx)}
                      repExpanded={repExpanded}
                      toggleRepExpanded={toggleRepExpanded}
                      repFolders={repFolders}
                      currentNodeId={currentNodeId}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {noFolder.map(({ rep, idx }) => (
          <RepItem
            key={rep.id}
            rep={rep}
            idx={idx}
            isActive={idx === activeRepIndex}
            onClick={() => repertoireService.selectRepertoire(idx)}
            repExpanded={repExpanded}
            toggleRepExpanded={toggleRepExpanded}
            repFolders={repFolders}
            currentNodeId={currentNodeId}
          />
        ))}
      </div>
    </div>
  );
}

// ─── RepertoirePanel ─────────────────────────────────────────────────────

export const RepertoirePanel = React.memo(function RepertoirePanel() {
  const repertoires       = useRepertoireStore((s) => s.repertoires);
  const activeRepIndex    = useRepertoireStore((s) => s.activeRepIndex);
  const repExpanded       = useRepertoireStore((s) => s.repExpanded);
  const repFolders        = useRepertoireStore((s) => s.repFolders);
  const toggleRepExpanded = useRepertoireStore((s) => s.toggleRepExpanded);
  const currentNodeId     = useRepertoireStore((s) => s.currentNodeId);
  useRepertoireStore((s) => s.version); // force re-render after medal upgrade

  const whites = useMemo(
    () => repertoires.map((rep, idx) => ({ rep, idx })).filter(({ rep }) => rep.color !== 'b'),
    [repertoires],
  );
  const blacks = useMemo(
    () => repertoires.map((rep, idx) => ({ rep, idx })).filter(({ rep }) => rep.color === 'b'),
    [repertoires],
  );

  if (repertoires.length === 0) {
    return <div className="panel-empty">Aucun répertoire. Créez-en un !</div>;
  }

  return (
    <div className="repertoire-panel" id="repertoire-panel">
      <ColorSection
        label="BLANCS"
        items={whites}
        sectionKey="white"
        activeRepIndex={activeRepIndex}
        repExpanded={repExpanded}
        repFolders={repFolders}
        toggleRepExpanded={toggleRepExpanded}
        currentNodeId={currentNodeId}
      />
      <ColorSection
        label="NOIRS"
        items={blacks}
        sectionKey="black"
        activeRepIndex={activeRepIndex}
        repExpanded={repExpanded}
        repFolders={repFolders}
        toggleRepExpanded={toggleRepExpanded}
        currentNodeId={currentNodeId}
      />
    </div>
  );
});
