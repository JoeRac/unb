import { useCallback, useState } from 'react';
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

/* ───────── Types ───────── */

type DemoNodeData = {
  label: string;
  description: string;
  color: string;
  category: string;
};

/* ───────── Custom Node ───────── */

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
          ? '0 0 0 3px rgba(255,255,255,0.9)'
          : '0 10px 25px rgba(0,0,0,0.25)',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <strong>{data.label}</strong>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{data.category}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { demo: DemoNode };

/* ───────── Initial Data ───────── */

const initialNodes: Node<DemoNodeData>[] = [
  {
    id: '1',
    type: 'demo',
    position: { x: 200, y: 50 },
    data: {
      label: 'Signal-Producing Experience',
      description: 'Core experience layer',
      color: '#6366f1',
      category: 'Experience',
    },
  },
  {
    id: '2',
    type: 'demo',
    position: { x: 50, y: 250 },
    data: {
      label: 'Signal Reading',
      description: 'Somatic interpretation',
      color: '#22c55e',
      category: 'Reading',
    },
  },
  {
    id: '3',
    type: 'demo',
    position: { x: 350, y: 250 },
    data: {
      label: 'Cognitive Key',
      description: 'Meaning resolution',
      color: '#f59e0b',
      category: 'Insight',
    },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
];

/* ───────── Canvas ───────── */

function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [bg, setBg] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [selectedNode, setSelectedNode] = useState<Node<DemoNodeData> | null>(null);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const addNode = () => {
    setNodes((nds) => [
      ...nds,
      {
        id: `node-${nds.length + 1}`,
        type: 'demo',
        position: { x: 100 + nds.length * 40, y: 400 },
        data: {
          label: 'New Node',
          description: 'Dynamic node',
          color: '#0ea5e9',
          category: 'Dynamic',
        },
      },
    ]);
  };

  return (
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
      <MiniMap nodeColor={(n) => n.data?.color || '#999'} />
      <Controls />
      <Background variant={bg} />

      <Panel position="top-left">
        <button onClick={addNode}>➕ Add Node</button>
        <button onClick={() => setBg(BackgroundVariant.Dots)}>Dots</button>
        <button onClick={() => setBg(BackgroundVariant.Lines)}>Lines</button>
        <button onClick={() => setBg(BackgroundVariant.Cross)}>Cross</button>
      </Panel>

      {selectedNode && (
        <Panel position="bottom-right">
          <strong>{selectedNode.data.label}</strong>
          <p style={{ fontSize: 12 }}>{selectedNode.data.description}</p>
        </Panel>
      )}
    </ReactFlow>
  );
}

/* ───────── App ───────── */

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  );
}
