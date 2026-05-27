import React from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { NodeField } from './NodeField';
import type { APINodeData } from '../types';

interface APINodeProps {
  id: string;
  data: APINodeData;
}

export const APINode = ({ id, data }: APINodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const method = typeof data?.method === 'string' ? data.method : 'GET';
  const endpoint = typeof data?.endpoint === 'string' ? data.endpoint : '';

  return (
    <BaseNode
      title="API"
      inputs={[{ id: `${id}-input` }]}
      outputs={[{ id: `${id}-output` }]}
      width="w-64"
    >
      <NodeField label="Method">
        <select
          className="w-full rounded border px-2 py-1 bg-transparent text-white focus:outline-none"
          value={method}
          onChange={(e) => updateNodeField(id, 'method', e.target.value)}
        >
          <option value="" disabled>
            Select method
          </option>
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>DELETE</option>
        </select>
      </NodeField>
      <NodeField label="Endpoint">
        <input
          className="w-full rounded border px-2 py-1 text-xs bg-transparent text-white placeholder-gray-300 focus:outline-none"
          placeholder="/api/endpoint"
          value={endpoint}
          onChange={(e) => updateNodeField(id, 'endpoint', e.target.value)}
        />
      </NodeField>
    </BaseNode>
  );
};
