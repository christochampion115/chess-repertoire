import { state } from './state.js';

export function findLastUniquePosition(node) {
  let current = node;
  while (current && current.children.length === 1) {
    current = current.children[0];
  }
  return current;
}

export function countTotalChildren(node) {
  let count = node.children.length;
  node.children.forEach(child => {
    count += countTotalChildren(child);
  });
  return count;
}

export function isDescendant(parent, node) {
  let temp = node;
  while (temp) {
    if (temp.id === parent.id) return true;
    temp = temp.parent;
  }
  return false;
}

export function getPathString(node) {
  if (!node) return '';
  const path = [];
  let current = node;
  const root = state.activeRepIndex !== -1 ? state.repertoires[state.activeRepIndex] : state.freePlayRoot;
  while (current && current !== root) {
    path.unshift(current);
    current = current.parent;
  }
  return path
    .map(n => `${n.turn === 'w' ? n.moveNum + '.' : (path.indexOf(n) === 0 ? n.moveNum + '...' : '')}${n.san}${n.annotation || ''}`)
    .join(' ');
}

export function renderArbre(onNodeSelect, onNodeContext) {
  const rootUl = document.createElement('ul');
  rootUl.className = 'tree-root';
  const rootNode = state.activeRepIndex !== -1 ? state.repertoires[state.activeRepIndex] : state.freePlayRoot;

  function createMoveEl(node, hideNum = false) {
    const el = document.createElement('div');
    el.className = `move-text ${state.currentNode.id === node.id ? 'active' : ''}`;
    if (!hideNum) {
      const numEl = document.createElement('span');
      numEl.className = 'move-num';
      numEl.textContent = node.turn === 'w' ? node.moveNum + '.' : node.moveNum + '...';
      el.appendChild(numEl);
      el.appendChild(document.createTextNode(' '));
    }

    el.append(node.san);

    if (node.annotation) {
      const annotationEl = document.createElement('span');
      annotationEl.className = 'annotation-tag';
      annotationEl.textContent = node.annotation;
      el.appendChild(annotationEl);
    }

    if (node.isTransposition) {
      el.appendChild(document.createTextNode(' ↪'));
    }

    el.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      onNodeContext(e, node);
    };
    el.onclick = e => {
      e.stopPropagation();
      onNodeSelect(node);
    };
    return el;
  }

  function walk(node, parentEl) {
    if (node.children.length > 1 || node === rootNode) {
      node.children.forEach(child => {
        const li = document.createElement('li');
        li.className = 'tree-node';
        const line = document.createElement('div');
        line.className = 'tree-line';
        li.appendChild(line);

        if (child.children.length > 0) {
          const toggle = document.createElement('div');
          toggle.className = 'tree-toggle';
          toggle.textContent = state.treeExpanded.has(child.id) ? '−' : '+';
          toggle.onclick = e => {
            e.stopPropagation();
            state.treeExpanded.has(child.id) ? state.treeExpanded.delete(child.id) : state.treeExpanded.add(child.id);
            onNodeSelect(null);
          };
          line.prepend(toggle);
        }

        line.appendChild(createMoveEl(child));

        if (state.treeExpanded.has(child.id)) {
          let currentChain = child;
          while (currentChain.children.length === 1 && !currentChain.isTransposition) {
            const next = currentChain.children[0];
            const shouldHideNum = currentChain.turn === 'w' && next.turn === 'b';
            line.appendChild(createMoveEl(next, shouldHideNum));
            currentChain = next;
          }
          if (currentChain.children.length > 1) {
            const subUl = document.createElement('ul');
            subUl.className = 'tree-root';
            li.appendChild(subUl);
            walk(currentChain, subUl);
          }
        }

        parentEl.appendChild(li);
      });
    }
  }

  walk(rootNode, rootUl);
  return rootUl;
}
