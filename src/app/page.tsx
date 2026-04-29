import { authOrigin, signIn } from "@/auth";
import { cookies } from "next/headers";

type GraphNode = {
  id: string;
  x: number;
  y: number;
  cluster: number;
  radius: number;
  color: string;
  label?: string;
  isHub?: boolean;
  labelDx?: number;
  labelDy?: number;
};

type GraphEdge = {
  a: GraphNode;
  b: GraphNode;
  opacity: number;
  stroke: string;
  width: number;
};

const VIEW_WIDTH = 1400;
const VIEW_HEIGHT = 900;

const CLUSTERS = [
  { x: 230, y: 280, color: "rgba(56,189,248,0.95)", name: "you" },
  { x: 660, y: 230, color: "rgba(74,222,128,0.95)", name: "friend-a" },
  { x: 1000, y: 340, color: "rgba(147,197,253,0.95)", name: "friend-b" },
  { x: 940, y: 700, color: "rgba(134,239,172,0.95)", name: "friend-c" },
  { x: 420, y: 690, color: "rgba(125,211,252,0.95)", name: "friend-d" },
];

const LABELS_BY_CLUSTER = [
  ["Radiohead", "The Strokes", "Arctic Monkeys", "Phoebe Bridgers", "Lorde", "Tame Impala"],
  ["Tyler, The Creator", "Frank Ocean", "SZA", "Kendrick Lamar", "Steve Lacy", "Childish Gambino"],
  ["Bad Bunny", "Karol G", "Rosalia", "Feid", "J Balvin", "Rauw Alejandro"],
  ["Fred again..", "Daft Punk", "Disclosure", "Kaytranada", "Bicep", "Jamie xx"],
  ["The Cure", "Depeche Mode", "The Smiths", "The 1975", "Paramore", "The Killers"],
];

function seeded(seed: number): number {
  const value = Math.sin(seed * 999.17) * 10000;
  return value - Math.floor(value);
}

function buildNodes(): GraphNode[] {
  const nodes: GraphNode[] = [];
  const perCluster = 22;

  CLUSTERS.forEach((cluster, clusterIndex) => {
    for (let i = 0; i < perCluster; i += 1) {
      const seed = clusterIndex * 100 + i + 1;
      const angle = seeded(seed) * Math.PI * 2;
      const spread = 60 + seeded(seed + 1) * 230;
      const jitter = seeded(seed + 2) * 40;

      const x = Math.max(
        25,
        Math.min(
          VIEW_WIDTH - 25,
          cluster.x + Math.cos(angle) * spread + Math.sin(angle * 2) * jitter
        )
      );
      const y = Math.max(
        25,
        Math.min(
          VIEW_HEIGHT - 25,
          cluster.y + Math.sin(angle) * spread + Math.cos(angle * 2) * jitter
        )
      );

      nodes.push({
        id: `${clusterIndex}-${i}`,
        x,
        y,
        cluster: clusterIndex,
        radius: 3 + seeded(seed + 3) * 4.8,
        color: cluster.color,
        label:
          i % 11 === 0
            ? LABELS_BY_CLUSTER[clusterIndex % LABELS_BY_CLUSTER.length][
                Math.floor(i / 11) %
                  LABELS_BY_CLUSTER[clusterIndex % LABELS_BY_CLUSTER.length].length
              ]
            : undefined,
        isHub: i === 0 || i === 1,
        labelDx: i % 2 === 0 ? 12 : -12,
        labelDy: i % 3 === 0 ? -12 : 18,
      });
    }
  });

  return nodes;
}

function buildEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  nodes.forEach((node) => {
    const neighbors = nodes
      .filter((candidate) => candidate.id !== node.id)
      .map((candidate) => {
        const dx = node.x - candidate.x;
        const dy = node.y - candidate.y;
        const distance = Math.hypot(dx, dy);
        const sameClusterBoost = candidate.cluster === node.cluster ? -120 : 0;
        return { candidate, score: distance + sameClusterBoost, distance };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    neighbors.forEach(({ candidate, distance }) => {
      if (distance > 260) return;
      const key = [node.id, candidate.id].sort().join(":");
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({
        a: node,
        b: candidate,
        opacity: Math.max(0.14, 0.5 - distance / 700),
        stroke:
          node.cluster === candidate.cluster
            ? "rgba(74,222,128,0.8)"
            : "rgba(125,211,252,0.75)",
        width: node.cluster === candidate.cluster ? 1.5 : 1.2,
      });
    });
  });

  const hubs = nodes.filter((node) => node.isHub);
  for (let i = 0; i < hubs.length; i += 1) {
    for (let j = i + 1; j < hubs.length; j += 1) {
      const a = hubs[i];
      const b = hubs[j];
      if (a.cluster === b.cluster) continue;
      const key = [a.id, b.id].sort().join(":");
      if (seen.has(key)) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 520) continue;
      seen.add(key);
      edges.push({
        a,
        b,
        opacity: Math.max(0.22, 0.48 - distance / 1200),
        stroke: "rgba(250,204,21,0.78)",
        width: 2,
      });
    }
  }

  return edges;
}

const graphNodes = buildNodes();
const graphEdges = buildEdges(graphNodes);

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.2),transparent_58%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(3,7,18,0.82)_68%)]" />
        <div className="absolute left-[14%] top-[20%] h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute left-[62%] top-[10%] h-72 w-72 rounded-full bg-green-500/10 blur-3xl" />
        <div className="absolute left-[70%] top-[58%] h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="absolute inset-0 h-full w-full opacity-65"
          preserveAspectRatio="none"
        >
          <g className="animate-[pulse_12s_ease-in-out_infinite]">
            {graphEdges.map((edge) => (
              <line
                key={`${edge.a.id}-${edge.b.id}`}
                x1={edge.a.x}
                y1={edge.a.y}
                x2={edge.b.x}
                y2={edge.b.y}
                stroke={edge.stroke}
                strokeOpacity={edge.opacity}
                strokeWidth={edge.width}
              />
            ))}
          </g>
          <g>
            {graphNodes.map((node) => (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius + 2}
                  fill="rgba(255,255,255,0.1)"
                />
                <circle cx={node.x} cy={node.y} r={node.radius} fill={node.color} />
                {node.isHub ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 4.5}
                    fill="none"
                    stroke="rgba(250,204,21,0.55)"
                    strokeWidth="1.5"
                  />
                ) : null}
                {node.label ? (
                  <text
                    x={node.x + (node.labelDx ?? 12)}
                    y={node.y + (node.labelDy ?? -10)}
                    textAnchor={(node.labelDx ?? 12) < 0 ? "end" : "start"}
                    fontSize="16"
                    fontWeight="700"
                    fill="rgba(250,204,21,0.82)"
                  >
                    {node.label}
                  </text>
                ) : null}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-3 text-sm uppercase tracking-[0.25em] text-green-400">
          Spotify Social Graph
        </p>

        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Map your music taste through your friends
        </h1>

        <p className="mb-8 max-w-2xl text-base text-neutral-300 sm:text-lg">
          Sign in with Spotify, build your music profile, connect with friends,
          and see how similar your listening tastes really are.
        </p>

        <form
          action={async () => {
            "use server";
            const cookieStore = await cookies();
            const authCookieNames = [
              "authjs.pkce.code_verifier",
              "authjs.state",
              "__Secure-authjs.pkce.code_verifier",
              "__Secure-authjs.state",
            ];
            for (const name of authCookieNames) {
              cookieStore.delete(name);
            }
            await signIn("spotify", {
              redirectTo: `${authOrigin()}/dashboard`,
            }, {
              show_dialog: "true",
            });
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-green-500 px-6 py-3 font-medium text-black transition hover:bg-green-400"
          >
            Sign in with Spotify
          </button>
        </form>
      </div>
    </main>
  );
}