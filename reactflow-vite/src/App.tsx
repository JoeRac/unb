import { useCallback, useState } from 'react';
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
  Panel,
  Node,
  Edge,
  Connection,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

/* -----------------------------
   Types
-------------------------------- */
type DemoNodeData = {
  label: string;
  description: string;
  color: string;
  category: string;
};

/* -----------------------------
   Custom Node
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
        minWidth: 190,
        boxShadow: selected
          ? '0 0 0 3px rgba(255,255,255,0.9)'
          : '0 14px 35px rgba(0,0,0,0.25)',
        transition: 'all 0.25s ease',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <strong>{data.label}</strong>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{data.category}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        {data.description}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { demo: DemoNode };

/* -----------------------------
   Initial Graph
-------------------------------- */
const baseNodes: Node[] = [
  {
    id: '1',
    type: 'demo',
    data: {
      label: 'Signal-Producing Experience',
      description: 'Thought, memory, sensation, situation',
      color: '#6366f1',
      category: 'Experience',
    },
    position: { x: 0, y: 0 },
  },
  {
    id: '2',
    type: 'demo',
    data: {
      label: 'Attentive Signal Reading',
      description: 'Somatic reading & awareness',
      color: '#0ea5e9',
      category: 'Reading',
    },
    position: { x: 0, y: 150 },
  },
  {
    id: '3',
    type: 'demo',
    data: {
      label: 'Cognitive Key',
      description: 'Mental / Experiential / Mixed',
      color: '#10b981',
      category: 'Reframe',
    },
    position: { x: 0, y: 300 },
  },
];

const baseEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
];

/* -----------------------------
   Layout helpers
-------------------------------- */
function verticalLayout(nodes: Node[]) {
  return nodes.map((n, i) => ({
    ...n,
    position: { x: 200, y: i * 160 },
  }));
}

function horizontalLayout(nodes: Node[]) {
  return nodes.map((n, i) => ({
    ...n,
    position: { x: i * 260, y: 200 },
  }));
}

/* -----------------------------
   App
-------------------------------- */
export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    verticalLayout(baseNodes)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_e: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const applyLayout = (type: 'vertical' | 'horizontal') => {
    setNodes((nds) =>
      type === 'vertical' ? verticalLayout(nds) : horizontalLayout(nds)
    );
  };

  const updateNodeData = (key: keyof DemoNodeData, value: string) => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: { ...(n.data as DemoNodeData), [key]: value },
            }
          : n
      )
    );
  };

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
            typeof n.data === 'object' && n.data && 'color' in n.data
              ? (n.data as DemoNodeData).color
              : '#999'
          }
        />
        <Controls />
        <Background gap={18} />

        {/* Layout Controls */}
        <Panel position="top-left">
          <button onClick={() => applyLayout('vertical')}>⬇ Vertical</button>
          <button onClick={() => applyLayout('horizontal')}>➡ Horizontal</button>
        </Panel>

        {/* Inspector Panel */}
        {selectedNode && (
          <Panel position="top-right">
            <strong>Edit Node</strong>
            <input
              value={(selectedNode.data as DemoNodeData).label}
              onChange={(e) => updateNodeData('label', e.target.value)}
            />
            <input
              value={(selectedNode.data as DemoNodeData).description}
              onChange={(e) => updateNodeData('description', e.target.value)}
            />
            <input
              type="color"
              value={(selectedNode.data as DemoNodeData).color}
              onChange={(e) => updateNodeData('color', e.target.value)}
            />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
