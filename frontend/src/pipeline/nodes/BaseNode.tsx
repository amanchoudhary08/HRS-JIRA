import React, { forwardRef } from 'react';
import { Handle, Position } from 'reactflow';
import type { HandleConfig } from '../types';

interface BaseNodeProps {
  title: string;
  children?: React.ReactNode;
  inputs?: HandleConfig[];
  outputs?: HandleConfig[];
  width?: string;
}

export const BaseNode = forwardRef<HTMLDivElement, BaseNodeProps>(
  ({ title, children, inputs = [], outputs = [], width = 'w-56' }, ref) => {
    const handleStyle: React.CSSProperties = {
      width: '10px',
      height: '10px',
      background: 'var(--vs-gradient)',
      border: '2px solid var(--vs-card-bg)',
      borderRadius: '50%',
      cursor: 'crosshair',
      zIndex: 50,
    };

    const renderHandles = (
      handles: HandleConfig[],
      type: 'source' | 'target',
      position: Position
    ) =>
      handles.map((handle, index) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={type}
          position={position}
          isConnectable
          style={{
            ...handleStyle,
            top: `${((index + 1) * 100) / (handles.length + 1)}%`,
            transform:
              type === 'target'
                ? 'translate(-50%, -50%)'
                : 'translate(50%, -50%)',
          }}
        />
      ));

    return (
      <div
        ref={ref}
        className={`${width} relative rounded-xl border shadow-lg transition-shadow duration-200 hover:shadow-2xl bg-[#2A0E4F] border-[#4C1D95]`}
      >
        <div className="drag-handle rounded-t-xl px-4 py-2.5 text-sm font-bold text-white bg-[#4C1D95]">
          {title}
        </div>
        <div className="space-y-3 p-4 text-sm text-white">{children}</div>
        {renderHandles(inputs, 'target', Position.Left)}
        {renderHandles(outputs, 'source', Position.Right)}
      </div>
    );
  }
);

BaseNode.displayName = 'BaseNode';
