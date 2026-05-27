import React from 'react';
import { BaseNode } from './BaseNode';

interface LLMNodeProps {
  id: string;
}

export const LLMNode = ({ id }: LLMNodeProps) => {
  return (
    <BaseNode
      title="LLM"
      inputs={[{ id: `${id}-system` }, { id: `${id}-prompt` }]}
      outputs={[{ id: `${id}-response` }]}
    >
      <div className="rounded p-2 bg-[#4C1D95]">
        <p className="text-white">Large Language Model</p>
      </div>
    </BaseNode>
  );
};
