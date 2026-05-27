import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { InputNodeData } from '../types';

interface InputNodeProps {
  id: string;
  data: InputNodeData;
}

export const InputNode = ({ id, data }: InputNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const name = data?.inputName ?? 'input';
  const type = data?.inputType ?? 'Text';

  return (
    <BaseNode title="Input" outputs={[{ id: `${id}-value` }]}>
      <NodeField label="Name">
        <input
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={name}
          onChange={(e) => updateNodeField(id, 'inputName', e.target.value)}
        />
      </NodeField>
      <NodeField label="Type">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={type}
          onChange={(e) => updateNodeField(id, 'inputType', e.target.value)}
        >
          <option value="Text">Text</option>
          <option value="File">File</option>
        </select>
      </NodeField>
    </BaseNode>
  );
};
