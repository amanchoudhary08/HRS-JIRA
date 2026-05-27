import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { OutputNodeData } from '../types';

interface OutputNodeProps {
  id: string;
  data: OutputNodeData;
}

export const OutputNode = ({ id, data }: OutputNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const name = data?.outputName ?? 'output';
  const type = data?.outputType ?? 'Text';

  return (
    <BaseNode title="Output" inputs={[{ id: `${id}-value` }]}>
      <NodeField label="Name">
        <input
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={name}
          onChange={(e) => updateNodeField(id, 'outputName', e.target.value)}
        />
      </NodeField>
      <NodeField label="Type">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={type}
          onChange={(e) => updateNodeField(id, 'outputType', e.target.value)}
        >
          <option>Text</option>
          <option>Image</option>
        </select>
      </NodeField>
    </BaseNode>
  );
};
