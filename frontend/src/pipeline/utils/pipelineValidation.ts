import type { Node, Edge } from 'reactflow';
import type { ValidationResult } from '../types';

const checkConnectivity = (nodes: Node[], edges: Edge[]): boolean => {
  if (nodes.length <= 1) return true;

  const graph = new Map<string, string[]>();
  nodes.forEach((node) => graph.set(node.id, []));

  edges.forEach((edge) => {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    if (!graph.has(edge.target)) graph.set(edge.target, []);
    graph.get(edge.source)!.push(edge.target);
    graph.get(edge.target)!.push(edge.source);
  });

  const visited = new Set<string>();
  const dfs = (nodeId: string): void => {
    visited.add(nodeId);
    graph.get(nodeId)?.forEach((neighbor) => {
      if (!visited.has(neighbor)) dfs(neighbor);
    });
  };

  dfs(nodes[0].id);
  return visited.size === nodes.length;
};

const detectCycles = (edges: Edge[]): boolean => {
  const graph = new Map<string, string[]>();
  const visited = new Set<string>();
  const recStack = new Set<string>();

  edges.forEach((edge) => {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    graph.get(edge.source)!.push(edge.target);
  });

  const hasCycle = (node: string): boolean => {
    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && hasCycle(neighbor)) return true;
      if (recStack.has(neighbor)) return true;
    }

    recStack.delete(node);
    return false;
  };

  for (const [node] of graph) {
    if (!visited.has(node) && hasCycle(node)) return true;
  }
  return false;
};

export const validatePipeline = (
  nodes: Node[],
  edges: Edge[]
): ValidationResult => {
  return {
    hasInputs: nodes.some((n) => n.type === 'customInput'),
    hasOutputs: nodes.some((n) => n.type === 'customOutput'),
    isConnected: checkConnectivity(nodes, edges),
    cycles: detectCycles(edges),
  };
};
