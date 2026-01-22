import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  BackgroundVariant,
  NodeProps,
  Node,
  Edge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/* ───────────────────── TYPES ───────────────────── */

type DemoNodeData = {
  label: string;
  description: string;
  color: string;
  category: string;
};

/* ───────────────────── CUSTOM NODE ───────────────────── */

function DemoNode({ data, selected }: NodeProps<DemoNodeData>) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: data.color,
        color: '#fff',
        minWidth: 160,
        boxShadow: selected
          ? '0 0 0 3px rgba(255,255,255,0.8)'
          : '0 10px 25px rgba(0,0,0,0.25)',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <strong>{data.label}</strong>
      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
        {data.category}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { demo: DemoNode };

/* ───────────────────── INITIAL DATA ───────────────────── */

const baseNodes: Node<DemoNodeData>[] = [
  {
    id: '1',
    type: 'demo',
    position: { x: 200, y: 40 },
    data: {
      label: 'Signal-Producing Experience',
      description: 'Where the signal is strongest',
      color: '#6366f1',
      category: 'Experience',
    },
  },
  {
    id: '2',
    type: 'demo',
    position: { x: 40, y: 220 },
    data: {
      label: 'Attentive Signal Reading',
      description: 'Reading somatic meaning',
      color: '#22c55e',
      category: 'Reading',
    },
  },
  {
    id: '3',
    type: 'demo',
    position: { x: 360, y: 220 },
    data: {
      label: 'Cognitive Key',
      description: 'Meaning resolution',
      color: '#f59e0b',
      category: 'Insight',
    },
  },
  {
    id: '4',
    type: 'demo',
    position: { x: 200, y: 400 },
    data: {
      label: 'Implementation',
      description: 'Thought / Action / Hybrid',
      color: '#ec4899',
      category: 'Action',
    },
  },
];

const baseEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
];

/* ───────────────────── FLOW CANVAS ───────────────────── */

function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);
  const [bg, setBg] = useState<BackgroundVariant>('dots');
  const [selectedNode, setSelectedNode] = useState<Node<DemoNodeData> | null>(null);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  /* ───── Layout Switching ───── */

  const setLayout = (mode: 'vertical' | 'horizontal' | 'grid') => {
    setNodes((nds) =>
      nds.map((n, i) => {
        if (mode === 'vertical') return { ...n, position: { x: 200, y: i * 160 } };
        if (mode === 'horizontal') return { ...n, position: { x: i * 240, y: 200 } };
        return { ...n, position: { x: (i % 2) * 260, y: Math.floor(i / 2) * 180 } };
      })
    );
  };

  /* ───── Add Node ───── */

  const addNode = () => {
    setNodes((nds) => [
      ...nds,
      {
        id: crypto.randomUUID(),
        type: 'demo',
        position: { x: Math.random() * 500, y: Math.random() * 500 },
        data: {
          label: 'New Node',
          description: 'Dynamically created',
          color: '#0ea5e9',
          category: 'Dynamic',
        },
      },
    ]);
  };

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNode(node)}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background variant={bg} />

        {/* LEFT PANEL */}
        <Panel position="top-left">
          <button onClick={addNode}>➕ Add Node</button>
          <button onClick={() => setLayout('vertical')}>⬇ Vertical</button>
          <button onClick={() => setLayout('horizontal')}>➡ Horizontal</button>
          <button onClick={() => setLayout('grid')}>🔲 Grid</button>
        </Panel>

        {/* RIGHT PANEL */}
        <Panel position="top-right">
          <select value={bg} onChange={(e) => setBg(e.target.value as BackgroundVariant)}>
            <option value="dots">Dots</option>
            <option value="lines">Lines</option>
            <option value="cross">Cross</option>
          </select>
        </Panel>
      </ReactFlow>

      {/* INFO PANEL */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            width: 280,
            padding: 16,
            background: '#0f172a',
            color: '#fff',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          }}
        >
          <strong>{selectedNode.data.label}</strong>
          <p style={{ fontSize: 13, opacity: 0.85 }}>
            {selectedNode.data.description}
          </p>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            Category: {selectedNode.data.category}
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────── APP ───────────────────── */

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  );
}
