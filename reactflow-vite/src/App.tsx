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
  // Removed unused 'useReactFlow'
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 1. Define the shape of your data
type NodeData = {
  label: string;
  description?: string;
  color: string;
  category: string;
  wikiUrl?: string;
  details?: string;
};

// 2. Custom Node Component
function MethodNode(props: any) {
  const data = props.data as NodeData;
  const selected = props.selected as boolean;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: data.color,
        color: '#fff',
        minWidth: 160,
        maxWidth: 200,
        boxShadow: selected
          ? '0 0 0 3px #ffd700, 0 8px 24px rgba(0,0,0,0.3)'
          : '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        border: '2px solid rgba(255,255,255,0.2)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 10, opacity: 0.8, fontStyle: 'italic' }}>
          {data.category}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
}

const nodeTypes = { method: MethodNode };

// 3. Initial Nodes (Hidden Logic)
const initialNodes: Node[] = [
  // LEVEL 1: Visible
  {
    id: 'title',
    type: 'method',
    data: {
      label: 'CIPHER METHOD',
      description: 'Cognitive Intelligence Pattern Handling & Emotional Release',
      color: '#1a1a2e',
      category: 'Framework',
      wikiUrl: 'https://example.com/cipher',
      details: 'This is the master node. Click to reveal the framework.',
    },
    position: { x: 600, y: 0 },
  },
  
  // LEVEL 2: Hidden
  {
    id: 'framework',
    type: 'method',
    hidden: true,
    data: {
      label: 'Somatic Intelligence Model',
      description: 'BS/US Signal Architecture',
      color: '#16213e',
      category: 'Core Theory',
    },
    position: { x: 600, y: 100 },
  },
  
  // LEVEL 3
  {
    id: 'bs-signal',
    type: 'method',
    hidden: true,
    data: {
      label: 'BS (Burden Signal)',
      description: 'Biological sense of burden',
      color: '#e74c3c',
      category: 'Signal Type',
      wikiUrl: 'https://en.wikipedia.org/wiki/Stress_(biology)',
    },
    position: { x: 400, y: 200 },
  },
  {
    id: 'us-signal',
    type: 'method',
    hidden: true,
    data: {
      label: 'US (Unburden Signal)',
      description: 'Relief, joy, safety achieved',
      color: '#27ae60',
      category: 'Signal Type',
    },
    position: { x: 800, y: 200 },
  },
  {
    id: 'si-grid',
    type: 'method',
    hidden: true,
    data: {
      label: 'Somatic Intelligence Grid',
      description: '4-Quadrant Assessment Tool',
      color: '#8e44ad',
      category: 'Assessment',
    },
    position: { x: 600, y: 300 },
  },

  // LEVEL 4
  { id: 'phantom-threat', type: 'method', hidden: true, position: { x: 350, y: 400 }, data: { label: 'Phantom Threat', color: '#e67e22', category: 'Quadrant' } },
  { id: 'clear-threat', type: 'method', hidden: true, position: { x: 550, y: 400 }, data: { label: 'Clear Threat', color: '#c0392b', category: 'Quadrant' } },
  { id: 'assumed-safety', type: 'method', hidden: true, position: { x: 750, y: 400 }, data: { label: 'Assumed Safety', color: '#f39c12', category: 'Quadrant' } },
  { id: 'grounded-safety', type: 'method', hidden: true, position: { x: 950, y: 400 }, data: { label: 'Grounded Safety', color: '#27ae60', category: 'Quadrant' } },

  // STEPS
  { id: 'step1', type: 'method', hidden: true, position: { x: 150, y: 550 }, data: { label: 'STEP 1: Immerse', color: '#3498db', category: 'Process', wikiUrl: 'https://google.com' } },
  { id: 'step2', type: 'method', hidden: true, position: { x: 450, y: 550 }, data: { label: 'STEP 2: Read Signal', color: '#9b59b6', category: 'Process' } },
  { id: 'step3', type: 'method', hidden: true, position: { x: 750, y: 550 }, data: { label: 'STEP 3: Design Key', color: '#e67e22', category: 'Process' } },
  { id: 'step4', type: 'method', hidden: true, position: { x: 1050, y: 550 }, data: { label: 'STEP 4: Implement', color: '#27ae60', category: 'Process' } },

  { id: 'step1-thought', type: 'method', hidden: true, position: { x: 0, y: 650 }, data: { label: 'Thought', color: '#5dade2', category: 'Exp Type' } },
  { id: 'step1-real', type: 'method', hidden: true, position: { x: 180, y: 650 }, data: { label: 'Real Situation', color: '#5dade2', category: 'Exp Type' } },
  
  { id: 'result-instant', type: 'method', hidden: true, position: { x: 1050, y: 850 }, data: { label: 'Instant Relief', color: '#1abc9c', category: 'Result' } },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'title', target: 'framework', animated: true },
  { id: 'e2', source: 'framework', target: 'bs-signal' },
  { id: 'e3', source: 'framework', target: 'us-signal' },
  { id: 'e4', source: 'framework', target: 'si-grid' },
  { id: 'e5', source: 'si-grid', target: 'phantom-threat' },
  { id: 'e6', source: 'si-grid', target: 'clear-threat' },
  { id: 'e7', source: 'si-grid', target: 'assumed-safety' },
  { id: 'e8', source: 'si-grid', target: 'grounded-safety' },
  { id: 'e9', source: 'si-grid', target: 'step1', animated: true, style: { strokeWidth: 2 } },
  { id: 'e10', source: 'step1', target: 'step2', animated: true },
  { id: 'e11', source: 'step2', target: 'step3', animated: true },
  { id: 'e12', source: 'step3', target: 'step4', animated: true },
  { id: 'e13', source: 'step1', target: 'step1-thought' },
  { id: 'e14', source: 'step1', target: 'step1-real' },
  { id: 'e15', source: 'step4', target: 'result-instant' },
];

export default function InteractiveDiagram() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      setSelectedNode(node);
      
      // Reveal children logic
      const childrenIds = edges
        .filter((e) => e.source === node.id)
        .map((e) => e.target);

      setNodes((nds) =>
        nds.map((n) => {
          if (childrenIds.includes(n.id)) {
            return { ...n, hidden: false };
          }
          return n;
        })
      );
    },
    [edges, setNodes]
  );

  // Helper to safely get data for the selected node
  const selectedNodeData = selectedNode ? (selectedNode.data as NodeData) : null;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
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
        <MiniMap nodeColor={(n) => ((n.data as NodeData).color) || '#fff'} />
        <Controls />
        <Background color="#222" gap={16} />

        {/* INFO PANEL */}
        {selectedNode && selectedNodeData && (
          <Panel
            position="top-right"
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              width: '300px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              color: '#333',
            }}
          >
            <button 
              onClick={() => setSelectedNode(null)}
              style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}
            >
              ✕
            </button>
            <h3 style={{ marginTop: 0, color: selectedNodeData.color }}>
              {selectedNodeData.label}
            </h3>
            
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
              TYPE: {selectedNodeData.category}
            </div>

            {selectedNodeData.description && (
              <p style={{ lineHeight: '1.5' }}>
                {selectedNodeData.description}
              </p>
            )}

            {selectedNodeData.details && (
              <p style={{ fontSize: '13px', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                {selectedNodeData.details}
              </p>
            )}

            {selectedNodeData.wikiUrl && (
              <div style={{ marginTop: '15px' }}>
                <a 
                  href={selectedNodeData.wikiUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: '#3498db',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '5px',
                    textDecoration: 'none',
                    fontWeight: 'bold'
                  }}
                >
                  Open Documentation ↗
                </a>
              </div>
            )}
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
