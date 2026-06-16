import type { RepertoireNode } from '@/types/repertoire';

export function countTotalChildren(node: RepertoireNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countTotalChildren(child);
  }
  return count;
}
