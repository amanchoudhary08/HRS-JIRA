import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { FilterNodeData } from '../types';

interface FilterNodeProps {
  id: string;
  data: FilterNodeData;
}

export const FilterNode = ({ id, data }: FilterNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const condition = data?.condition ?? 'contains';
  const value = data?.value ?? '';

  return (
    <BaseNode
      title="Filter"
      inputs={[{ id: `${id}-input` }]}
      outputs={[{ id: `${id}-pass` }, { id: `${id}-fail` }]}
    >
      <NodeField label="Condition">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={condition}
          onChange={(e) => updateNodeField(id, 'condition', e.target.value)}
        >
          <option>contains</option>
          <option>equals</option>
          <option>startsWith</option>
          <option>endsWith</option>
        </select>
      </NodeField>
      <NodeField label="Value">
        <input
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={value}
          onChange={(e) => updateNodeField(id, 'value', e.target.value)}
        />
      </NodeField>
    </BaseNode>
  );
};
