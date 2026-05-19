import { useEffect, useRef } from 'react';
import type { DataSet } from 'vis-data';
import type { Network, Options, Data, Edge, Node } from 'vis-network';

import { type GraphEdge, type GraphNode } from './types';

// Minimal structural type for the dynamically-imported `vis-data` module
// (the value resolved by `await import('vis-data')`). Only the `DataSet`
// constructor is consumed below, so this captures exactly that surface and
// avoids `any` per AAP TypeScript strictness rules (§0.9.2.7 / §0.8.6).
// `typeof DataSet` resolves to the constructor signature of the `DataSet`
// class even when imported type-only, satisfying
// `@typescript-eslint/consistent-type-imports` (which disallows inline
// `typeof import('...')` type annotations).
interface VisDataModule {
  DataSet: typeof DataSet;
}

interface OwnProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: 'UD' | 'DU' | 'LR' | 'RL';
  width?: string;
  height?: string;
}

interface ConnectedProps {}

interface DispatchProps {}

export type Props = OwnProps & ConnectedProps & DispatchProps;

export const NetworkGraph = ({ nodes, edges, direction, width, height }: Props) => {
  const network = useRef<Network | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const createNetwork = async () => {
      const visJs = await import(/* webpackChunkName: "vis-network" */ 'vis-network');
      const visData = await import(/* webpackChunkName: "vis-data" */ 'vis-data');
      const data: Data = {
        nodes: toVisNetworkNodes(visData, nodes),
        edges: toVisNetworkEdges(visData, edges),
      };
      const options: Options = {
        width: '100%',
        height: '100%',
        autoResize: true,
        layout: {
          improvedLayout: true,
          hierarchical: {
            enabled: true,
            direction: direction ?? 'DU',
            sortMethod: 'directed',
          },
        },
        interaction: {
          navigationButtons: true,
          dragNodes: false,
        },
      };
      if (ref.current) {
        network.current = new visJs.Network(ref.current, data, options);
      }
    };

    createNetwork();
  }, [direction, edges, nodes]);

  return (
    <div>
      {/* Design system gap: width/height are runtime-dynamic from the width/height props with fallbacks ('100%', '60vh') that don't map to GrafanaTheme2 spacing tokens. Box/Stack do not accept dynamic raw CSS dimension values. Kept as inline style per AAP §0.4.4 / §0.9.2.6 (do not approximate). */}
      <div ref={ref} style={{ width: width ?? '100%', height: height ?? '60vh' }} />
    </div>
  );
};

function toVisNetworkNodes(visData: VisDataModule, nodes: GraphNode[]): DataSet<Node> {
  const nodesWithStyle = nodes.map((node) => ({
    ...node,
    shape: 'box',
  }));
  return new visData.DataSet(nodesWithStyle);
}

function toVisNetworkEdges(visData: VisDataModule, edges: GraphEdge[]): DataSet<Edge> {
  const edgesWithStyle = edges.map((edge) => ({ ...edge, arrows: 'to', dashes: true }));
  // Explicit type parameter: `GraphEdge` has no `id` field, so the inferred
  // shape of `edgesWithStyle` does not share any property with the default
  // `PartItem<"id">` constraint of `DataSet`. Telling the constructor that
  // `Item = Edge` lets it accept the items via the structural overlap of
  // `from`/`to`. Behavior at runtime is identical to the previous untyped call.
  return new visData.DataSet<Edge>(edgesWithStyle);
}
