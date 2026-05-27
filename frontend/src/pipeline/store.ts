import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from 'reactflow';

interface NodeIDs {
  [type: string]: number;
}

interface PipelineStore {
  nodes: Node[];
  edges: Edge[];
  nodeIDs: NodeIDs;
  getNodeID: (type: string) => string;
  addNode: (node: Node) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  updateNodeField: (
    nodeId: string,
    fieldName: string,
    fieldValue: unknown
  ) => void;
  clearNodes: () => void;
}

export const useStore = create<PipelineStore>((set, get) => ({
  nodes: [],
  edges: [],
  nodeIDs: {},

  getNodeID: (type: string): string => {
    const nodeIDs = get().nodeIDs;
    const currentID = nodeIDs[type] ?? 0;
    const newID = currentID + 1;
    set({ nodeIDs: { ...nodeIDs, [type]: newID } });
    return `${type}-${newID}`;
  },

  addNode: (node: Node): void => {
    set({ nodes: [...get().nodes, node] });
  },

  onNodesChange: (changes: NodeChange[]): void => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes: EdgeChange[]): void => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection: Connection): void => {
    const { source, sourceHandle, target, targetHandle } = connection;

    if (!source || !target || !targetHandle) {
      console.warn('Invalid connection dropped:', connection);
      return;
    }

    set({
      edges: addEdge(
        {
          id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
          source,
          sourceHandle,
          target,
          targetHandle,
          type: 'smoothstep',
          animated: true,
          markerEnd: {
            type: MarkerType.Arrow,
            width: 20,
            height: 20,
          },
        },
        get().edges
      ),
    });
  },

  updateNodeField: (
    nodeId: string,
    fieldName: string,
    fieldValue: unknown
  ): void => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, [fieldName]: fieldValue } }
          : node
      ),
    });
  },

  clearNodes: (): void => {
    set({ nodes: [], edges: [], nodeIDs: {} });
  },
}));
