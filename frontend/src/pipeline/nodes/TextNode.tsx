import React, { useEffect, useMemo, useRef } from 'react';
import { BaseNode } from './BaseNode';
import { useStore } from '../store';
import { useUpdateNodeInternals } from 'reactflow';
import type { TextNodeData } from '../types';

interface TextNodeProps {
  id: string;
  data: TextNodeData;
}

export const TextNode = ({ id, data }: TextNodeProps) => {
  const updateNodeField = useStore((s) => s.updateNodeField);
  const updateNodeInternals = useUpdateNodeInternals();

  const baseRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevVarsRef = useRef<string[]>([]);

  const text = data?.text ?? '';

  const variables = useMemo(() => {
    const vars = new Set<string>();
    const regex = /{{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*}}/g;

    for (const match of text.matchAll(regex)) {
      vars.add(match[1]);
    }

    return Array.from(vars).sort();
  }, [text]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    const prev = prevVarsRef.current.join(',');
    const next = variables.join(',');

    if (prev !== next) {
      updateNodeField(id, 'variables', variables);
      prevVarsRef.current = variables;
    }

    const timeoutId = setTimeout(() => {
      updateNodeInternals(id);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [variables, id, updateNodeField, updateNodeInternals]);

  useEffect(() => {
    if (!baseRef.current) return;

    const observer = new ResizeObserver(() => {
      updateNodeInternals(id);
    });

    observer.observe(baseRef.current);
    return () => observer.disconnect();
  }, [id, updateNodeInternals]);

  const inputs = useMemo(
    () => variables.map((v) => ({ id: `${id}-${v}` })),
    [variables, id]
  );

  return (
    <BaseNode
      ref={baseRef}
      title="Text"
      inputs={inputs}
      outputs={[{ id: `${id}-output` }]}
      width="w-64"
    >
      <textarea
        ref={textareaRef}
        className="nodrag w-full resize-none rounded border border-[var(--vs-border)] px-2 py-1 text-sm bg-purple-800 text-white placeholder-white overflow-hidden"
        placeholder="Type text with {{variables}}"
        value={text}
        onChange={(e) => updateNodeField(id, 'text', e.target.value)}
      />
    </BaseNode>
  );
};
