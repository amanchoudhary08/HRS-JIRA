import React from 'react';
import { DraggableNode } from './draggableNode';
import { useStore } from './store';

export const PipelineToolbar = () => {
  const clearNodes = useStore((s) => s.clearNodes);

  return (
    <div className="glass border-b border-b-[var(--vs-border)] p-6 relative z-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Build Pipeline</h2>
        <button
          onClick={clearNodes}
          className="px-2 py-1 bg-red-800 hover:bg-red-700 text-white rounded focus:outline-none text-xs"
        >
          Clear All
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <DraggableNode type="customInput" label="Input" />
        <DraggableNode type="llm" label="LLM" />
        <DraggableNode type="customOutput" label="Output" />
        <DraggableNode type="text" label="Text" />
        <DraggableNode type="transform" label="Transform" />
        <DraggableNode type="filter" label="Filter" />
        <DraggableNode type="api" label="API" />
        <DraggableNode type="database" label="Database" />
        <DraggableNode type="conditional" label="Conditional" />
      </div>
    </div>
  );
};
