import { useCallback, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
  Panel,
  BackgroundVariant,
  NodeProps,
  Node,
  Edge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/* ---------- Types ---------- */

type CustomNodeData = {
  label: string;
  color: string;
  shape: 'rect' | 'circle' | 'diamond';
};

type ResizableNodeData = {
  label: string;
};

/* ---------- Custom Nodes ---------- */

function CustomNode({ data }: NodeProps<CustomNodeData>) {
  return (
    <div
      style={{
        padding: 10,
        border: `2px solid ${data.color}`,
        borderRadius:
          data.shape === 'circle' ? '50%' : data.shape === 'diamond' ? 6 : 4,
        background: '#fff',
        width: data.shape === 'diamond' ? 100 : 'auto',
        height: data.shape === 'diamond' ? 100 : 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: data.shape === 'diamond' ? 'rotate(45deg)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <span style={{ transform: data.shape === 'diamond' ? 'rotate(-45deg)' : undefined }}>
        {data.label}
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ResizableNode({ data }: NodeProps<ResizableNodeData>) {
  return (
    <div
      style={{
        padding: 10,
        resize: 'both',
        overflow: 'auto',
        minWidth: 120,
        minHeight: 60,
        background: '#f3f4f6',
        border: '1px solid #999',
      }}
    >
      {data.label}
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
  resizable: ResizableNode,
};

/* ---------- Initial Data ---------- */

const initialNodes: Node[] = [
  { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Start', color: '#ef4444', shape: 'rect' } },
  { id: '2', type: 'custom', position: { x: 220, y: 0 }, data: { label: 'Circle', color: '#22c55e', shape: 'circle' } },
  { id: '3', type: 'custom', position: { x: 440, y: 0 }, data: { label: 'Diamond', color: '#3b82f6', shape: 'diamond' } },
  { id: '4', type: 'resizable', position: { x: 0, y: 180 }, data: { label: 'Resizable' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-4', source: '3', target: '4' },
];

/* ---------- Inner Flow ---------- */

function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [bg, setBg] = useState<BackgroundVariant>('dots');

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const addNode = () => {
    setNodes((nds) => [
      ...nds,
      {
        id: crypto.randomUUID(),
        type: 'custom',
        position: { x: Math.random() * 500, y: Math.random() * 300 },
        data: { label: 'New Node', color: '#6366f1', shape: 'rect' },
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
      fitView
    >
      <MiniMap />
      <Controls />
      <Background variant={bg} />

      <Panel position="top-left">
        <button onClick={addNode}>Add Node</button>
      </Panel>

      <Panel position="top-right">
        <select value={bg} onChange={(e) => setBg(e.target.value as BackgroundVariant)}>
          <option value="dots">Dots</option>
          <option value="lines">Lines</option>
          <option value="cross">Cross</option>
        </select>
      </Panel>
    </ReactFlow>
  );
}

/* ---------- App ---------- */

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  );
}
