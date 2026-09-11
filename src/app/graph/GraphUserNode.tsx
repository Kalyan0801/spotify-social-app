"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type GraphUserNodeData = {
  label: string;
  image: string | null;
  isCenter?: boolean;
  compatibility: number | null;
};

function GraphUserNodeComponent({ data }: NodeProps) {
  const nodeData = data as GraphUserNodeData;
  const isCenter = Boolean(nodeData.isCenter);

  return (
    <div
      className={`flex w-[112px] flex-col items-center gap-2 rounded-2xl border px-2 py-3 shadow-lg ${
        isCenter
          ? "border-green-500 bg-neutral-900"
          : "border-neutral-700 bg-neutral-950 hover:border-green-500/70"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!left-1/2 !top-1/2 !h-1 !w-1 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!left-1/2 !top-1/2 !h-1 !w-1 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
      />

      {nodeData.image ? (
        <img
          src={nodeData.image}
          alt={nodeData.label}
          className={`rounded-full object-cover ${
            isCenter ? "h-14 w-14 ring-2 ring-green-500" : "h-12 w-12"
          }`}
        />
      ) : (
        <div
          className={`flex items-center justify-center rounded-full bg-neutral-800 text-sm text-neutral-400 ${
            isCenter ? "h-14 w-14 ring-2 ring-green-500" : "h-12 w-12"
          }`}
        >
          ?
        </div>
      )}

      <p className="w-full truncate text-center text-xs font-medium text-white">
        {nodeData.label}
      </p>

      {isCenter ? (
        <p className="text-[10px] uppercase tracking-wider text-green-400">
          You
        </p>
      ) : nodeData.compatibility !== null ? (
        <p className="text-[10px] tabular-nums text-neutral-400">
          {nodeData.compatibility}% match
        </p>
      ) : (
        <p className="text-[10px] text-neutral-500">No data yet</p>
      )}
    </div>
  );
}

export const GraphUserNode = memo(GraphUserNodeComponent);
