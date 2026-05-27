import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { ConditionalNodeData } from '../types';

interface ConditionalNodeProps {
  id: string;
  data: ConditionalNodeData;
}

export const ConditionalNode = ({ id, data }: ConditionalNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const operator = data?.operator ?? '==';

  return (
    <BaseNode
      title="Conditional"
      inputs={[{ id: `${id}-valueA` }, { id: `${id}-valueB` }]}
      outputs={[{ id: `${id}-true` }, { id: `${id}-false` }]}
    >
      <NodeField label="Operator">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={operator}
          onChange={(e) => updateNodeField(id, 'operator', e.target.value)}
        >
          <option value="==">==</option>
          <option value="!=">!=</option>
          <option value=">">{'>'}</option>
          <option value="<">{'<'}</option>
          <option value=">=">{'>='}</option>
          <option value="<=">{'<='}</option>
        </select>
        <p className="text-xs text-gray-300 mt-1">Compare A vs B</p>
      </NodeField>
    </BaseNode>
  );
};
