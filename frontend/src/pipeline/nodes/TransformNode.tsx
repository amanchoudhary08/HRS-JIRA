import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { TransformNodeData } from '../types';

interface TransformNodeProps {
  id: string;
  data: TransformNodeData;
}

export const TransformNode = ({ id, data }: TransformNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const operation = data?.operation ?? 'uppercase';

  return (
    <BaseNode
      title="Transform"
      inputs={[{ id: `${id}-input` }]}
      outputs={[{ id: `${id}-output` }]}
    >
      <NodeField label="Operation">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={operation}
          onChange={(e) => updateNodeField(id, 'operation', e.target.value)}
        >
          <option>uppercase</option>
          <option>lowercase</option>
          <option>trim</option>
          <option>reverse</option>
        </select>
      </NodeField>
    </BaseNode>
  );
};
