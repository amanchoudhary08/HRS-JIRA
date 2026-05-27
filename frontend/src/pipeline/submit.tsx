import React, { useState } from 'react';
import { useStore } from './store';
import { validatePipeline } from './utils/pipelineValidation';
import type { PipelineResponse } from './types';

export const SubmitButton = () => {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);

  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    const validation = validatePipeline(nodes, edges);

    if (!validation.hasInputs || !validation.hasOutputs) {
      alert('⚠️ Pipeline must have at least one Input and one Output node');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/pipelines/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodes: nodes.map((n) => ({ id: n.id })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as PipelineResponse;

      alert(
        `✨ Pipeline Analysis Results ✨\n\n` +
          `📊 Total Nodes: ${data.num_nodes}\n` +
          `🔗 Total Edges: ${data.num_edges}\n` +
          `${data.is_dag ? '✅ Valid DAG: Yes' : '❌ Valid DAG: No (Contains Cycles)'}`
      );
    } catch (error) {
      console.error('Pipeline submission failed:', error);
      alert(
        `❌ Failed to submit pipeline.\n\n` +
          `Please ensure the backend is running at http://127.0.0.1:8000`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/70 backdrop-blur-md border-t border-slate-800 p-4 flex justify-center w-full z-10">
      <button
        onClick={handleSubmit}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={loading}
        className={`rounded-full px-8 py-3 font-semibold text-white shadow-lg flex items-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
          loading
            ? 'bg-gray-600'
            : isHovered
              ? 'bg-gradient-to-br from-purple-800 via-indigo-700 to-blue-700'
              : 'bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600'
        }`}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Analyzing Pipeline...
          </>
        ) : (
          'Submit Pipeline'
        )}
      </button>
    </div>
  );
};
