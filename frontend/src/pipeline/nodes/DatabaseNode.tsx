import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { DatabaseNodeData } from '../types';

interface DatabaseNodeProps {
  id: string;
  data: DatabaseNodeData;
}

export const DatabaseNode = ({ id, data }: DatabaseNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const operation = data?.operation ?? 'SELECT';
  const table = data?.table ?? '';

  return (
    <BaseNode
      title="Database"
      inputs={[{ id: `${id}-query` }, { id: `${id}-params` }]}
      outputs={[{ id: `${id}-result` }]}
    >
      <NodeField label="Operation">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={operation}
          onChange={(e) => updateNodeField(id, 'operation', e.target.value)}
        >
          <option>SELECT</option>
          <option>INSERT</option>
          <option>UPDATE</option>
          <option>DELETE</option>
        </select>
      </NodeField>
      <NodeField label="Table">
        <input
          className="w-full rounded border px-2 py-1 bg-transparent text-white placeholder-gray-300 focus:outline-none"
          placeholder="table_name"
          value={table}
          onChange={(e) => updateNodeField(id, 'table', e.target.value)}
        />
      </NodeField>
    </BaseNode>
  );
};
