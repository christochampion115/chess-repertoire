import { createPortal } from 'react-dom';
import type { ActiveDrag } from '@/hooks/useDragPiece';

interface DragGhostProps {
  drag: ActiveDrag;
}

export function DragGhost({ drag }: DragGhostProps) {
  return createPortal(
    <img
      className="piece-ghost"
      src={drag.src}
      alt=""
      style={{
        left: drag.x - drag.size * 0.6,
        top: drag.y - drag.size * 0.6,
        width: drag.size * 1.2,
        height: drag.size * 1.2,
      }}
    />,
    document.body,
  );
}
