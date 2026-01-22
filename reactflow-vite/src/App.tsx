import React, { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

/* -----------------------------
   Node data definition
-------------------------------- */
type DemoNodeData = {
  label: string;
  description: string;
  color: string;
  category: string;
};

/* -----------------------------
   Custom node component
   NOTE: data is intentionally narrowed
-------------------------------- */
function DemoNode(props: any) {
  const data = props.data as DemoNodeData;
  const selected = props.selected as boolean;

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: data.color,
        color: '#fff',
        minWidth: 180,
        boxShadow: selected
          ? '0 0 0 3px rgba(255,255,255,0.9)'
          : '0 12px 30px rgba(0,0,0,0.25)',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 700 }}>{data.label}</div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        {data.category}
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        {data.description}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/* -----------------------------
   Node types
-------------------------------- */
const nodeTypes = {
  demo: DemoNode,
};

/* -----------------------------
   Initial nodes & edges
-------------------------------- */
const initialNodes: Node[] = [
  {
    id: '1',
    type: 'demo',
    position: { x: 200, y: 50 },
    data: {
      label: 'Signal-Producing Experience',
      description: 'Thought, memory, sensation, or situation',
      color: '#6366f1',
      category: 'Experience',
    },
  },
  {
    id: '2',
    type: 'demo',
    position: { x: 200, y: 220 },
    data: {
      label: 'Attentive Signal Reading',
      description: 'Somatic, reflective, immersive',
      color: '#0ea5e9',
      category: 'Reading',
    },
  },
  {
    id: '3',
    type: 'demo',
    position: { x: 200, y: 400 },
    data: {
      label: 'Cognitive Key',
      description: 'Mental, experiential, or mixed',
      color: '#10b981',
      category: 'Reframe',
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    animated: true,
    type: 'smoothstep',
  },
  {
    id: 'e2-3',
    source: '2',
    target: '3',
    animated: true,
    type: 'smoothstep',
  },
];

/* -----------------------------
   App
-------------------------------- */
export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge({ ...connection, animated: true }, eds)
      ),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...(n.data as DemoNodeData),
                  color:
                    (n.data as DemoNodeData).color === '#6366f1'
                      ? '#f97316'
                      : '#6366f1',
                },
              }
            : n
        )
      );
    },
    [setNodes]
  );

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView
      >
        <MiniMap
          nodeColor={(n) =>
            typeof n.data === 'object' &&
            n.data &&
            'color' in n.data
              ? (n.data as DemoNodeData).color
              : '#999'
          }
        />
        <Controls />
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}
