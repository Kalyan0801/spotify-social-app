"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeTypes,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./graph.css";
import { GraphUserNode, type GraphUserNodeData } from "./GraphUserNode";

type GraphUser = {
  id: string;
  displayName: string | null;
  image: string | null;
};

type GraphFriend = GraphUser & {
  compatibility: number | null;
};

type SocialGraphProps = {
  currentUser: GraphUser;
  friends: GraphFriend[];
};

const nodeTypes: NodeTypes = {
  graphUser: GraphUserNode,
};

function edgeStyleForScore(score: number | null): {
  stroke: string;
  strokeWidth: number;
  opacity: number;
} {
  if (score === null) {
    return { stroke: "#525252", strokeWidth: 1.5, opacity: 0.45 };
  }
  // Stronger matches = thicker / brighter green edges.
  const t = Math.min(1, Math.max(0, score / 100));
  return {
    stroke: score >= 60 ? "#22c55e" : score >= 35 ? "#4ade80" : "#737373",
    strokeWidth: 1.5 + t * 3.5,
    opacity: 0.4 + t * 0.55,
  };
}

export function SocialGraph({ currentUser, friends }: SocialGraphProps) {
  const router = useRouter();

  const centerX = 480;
  const centerY = 320;
  const radius = Math.min(280, 140 + friends.length * 18);

  const { nodes, edges } = useMemo(() => {
    const nextNodes: Node[] = [
      {
        id: currentUser.id,
        type: "graphUser",
        position: { x: centerX, y: centerY },
        data: {
          label: currentUser.displayName ?? "You",
          image: currentUser.image,
          isCenter: true,
          compatibility: null,
        } satisfies GraphUserNodeData,
        draggable: true,
      },
      ...friends.map((friend, index) => {
        const angle =
          (2 * Math.PI * index) / Math.max(friends.length, 1) - Math.PI / 2;

        return {
          id: friend.id,
          type: "graphUser",
          position: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          },
          data: {
            label: friend.displayName ?? "Friend",
            image: friend.image,
            isCenter: false,
            compatibility: friend.compatibility,
          } satisfies GraphUserNodeData,
          draggable: true,
        };
      }),
    ];

    const nextEdges: Edge[] = friends.map((friend) => {
      const style = edgeStyleForScore(friend.compatibility);
      return {
        id: `${currentUser.id}-${friend.id}`,
        source: currentUser.id,
        target: friend.id,
        label:
          friend.compatibility === null
            ? "—"
            : `${friend.compatibility}%`,
        labelStyle: {
          fill: "#e5e5e5",
          fontWeight: 600,
          fontSize: 12,
        },
        labelBgStyle: {
          fill: "#0a0a0a",
          fillOpacity: 0.85,
        },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 6,
        animated: (friend.compatibility ?? 0) >= 70,
        style: {
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          opacity: style.opacity,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: style.stroke,
          width: 16,
          height: 16,
        },
      };
    });

    return { nodes: nextNodes, edges: nextEdges };
  }, [currentUser, friends, radius]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === currentUser.id) return;
      router.push(`/friends/${node.id}`);
    },
    [currentUser.id, router]
  );

  return (
    <div className="h-[min(70vh,720px)] overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "default",
        }}
      >
        <Background color="#262626" gap={20} />
        <Controls
          showInteractive={false}
          className="graph-controls !overflow-hidden !rounded-xl !border !border-neutral-700 !shadow-none"
        />
      </ReactFlow>
      <p className="border-t border-neutral-800 px-4 py-2 text-center text-xs text-neutral-500">
        Drag to rearrange · scroll to zoom · click a friend for full
        compatibility
      </p>
    </div>
  );
}
