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
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type NodeData = {
  label: string;
  description?: string;
  color: string;
  category: string;
  wikiUrl?: string;
  details?: string;
};

// Custom Node Component with enhanced styling
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
      {data.description && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
}

const nodeTypes = { method: MethodNode };

// Complete CIPHER Method Nodes
const initialNodes: Node[] = [
  // Title
  {
    id: 'title',
    type: 'method',
    data: {
      label: 'CIPHER METHOD',
      description: 'Cognitive Intelligence Pattern Handling & Emotional Release',
      color: '#1a1a2e',
      category: 'Framework',
    },
    position: { x: 600, y: 0 },
  },
  
  // Framework Overview
  {
    id: 'framework',
    type: 'method',
    data: {
      label: 'Somatic Intelligence Model',
      description: 'BS/US Signal Architecture',
      color: '#16213e',
      category: 'Core Theory',
    },
    position: { x: 600, y: 100 },
  },
  
  {
    id: 'bs-signal',
    type: 'method',
    data: {
      label: 'BS (Burden Signal)',
      description: 'Biological sense of burden/bother that drives action',
      color: '#e74c3c',
      category: 'Signal Type',
    },
    position: { x: 400, y: 200 },
  },
  
  {
    id: 'us-signal',
    type: 'method',
    data: {
      label: 'US (Unburden Signal)',
      description: 'Relief, joy, safety achieved',
      color: '#27ae60',
      category: 'Signal Type',
    },
    position: { x: 800, y: 200 },
  },

  // Somatic Intelligence Grid
  {
    id: 'si-grid',
    type: 'method',
    data: {
      label: 'Somatic Intelligence Grid',
      description: '4-Quadrant Assessment Tool',
      color: '#8e44ad',
      category: 'Assessment',
    },
    position: { x: 600, y: 300 },
  },

  {
    id: 'phantom-threat',
    type: 'method',
    data: {
      label: 'Phantom Threat',
      description: 'High threat + Low evidence',
      color: '#e67e22',
      category: 'Quadrant',
    },
    position: { x: 350, y: 400 },
  },

  {
    id: 'clear-threat',
    type: 'method',
    data: {
      label: 'Clear Threat',
      description: 'High threat + High evidence',
      color: '#c0392b',
      category: 'Quadrant',
    },
    position: { x: 550, y: 400 },
  },

  {
    id: 'assumed-safety',
    type: 'method',
    data: {
      label: 'Assumed Safety',
      description: 'High safety + Low evidence',
      color: '#f39c12',
      category: 'Quadrant',
    },
    position: { x: 750, y: 400 },
  },

  {
    id: 'grounded-safety',
    type: 'method',
    data: {
      label: 'Grounded Safety',
      description: 'High safety + High evidence',
      color: '#27ae60',
      category: 'Quadrant',
    },
    position: { x: 950, y: 400 },
  },

  // STEP 1: Immerse
  {
    id: 'step1',
    type: 'method',
    data: {
      label: 'STEP 1: Immerse',
      description: 'Signal-Producing Experience',
      color: '#3498db',
      category: 'Process',
    },
    position: { x: 150, y: 550 },
  },

  {
    id: 'step1-thought',
    type: 'method',
    data: {
      label: 'Thought',
      description: 'Mental content producing signal',
      color: '#5dade2',
      category: 'Experience Type',
    },
    position: { x: 0, y: 650 },
  },

  {
    id: 'step1-real-situation',
    type: 'method',
    data: {
      label: 'Real Situation',
      description: 'Current life circumstance',
      color: '#5dade2',
      category: 'Experience Type',
    },
    position: { x: 180, y: 650 },
  },

  {
    id: 'step1-sensation',
    type: 'method',
    data: {
      label: 'Sensation',
      description: 'Body-based feeling',
      color: '#5dade2',
      category: 'Experience Type',
    },
    position: { x: 0, y: 750 },
  },

  {
    id: 'step1-idea',
    type: 'method',
    data: {
      label: 'Idea',
      description: 'Future possibility',
      color: '#5dade2',
      category: 'Experience Type',
    },
    position: { x: 180, y: 750 },
  },

  {
    id: 'step1-memory',
    type: 'method',
    data: {
      label: 'Memory',
      description: 'Past experience',
      color: '#5dade2',
      category: 'Experience Type',
    },
    position: { x: 90, y: 850 },
  },

  // STEP 2: Read Signal
  {
    id: 'step2',
    type: 'method',
    data: {
      label: 'STEP 2: Read Signal',
      description: 'Attentive Signal Reading',
      color: '#9b59b6',
      category: 'Process',
    },
    position: { x: 450, y: 550 },
  },

  {
    id: 'step2-walk',
    type: 'method',
    data: {
      label: 'Go for a Walk',
      description: 'Movement-based processing',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 360, y: 650 },
  },

  {
    id: 'step2-journal',
    type: 'method',
    data: {
      label: 'Journal',
      description: 'Written exploration',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 540, y: 650 },
  },

  {
    id: 'step2-therapy',
    type: 'method',
    data: {
      label: 'Talk Therapy',
      description: 'Professional dialogue',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 300, y: 750 },
  },

  {
    id: 'step2-prayer',
    type: 'method',
    data: {
      label: 'Prayer',
      description: 'Spiritual practice',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 480, y: 750 },
  },

  {
    id: 'step2-introspection',
    type: 'method',
    data: {
      label: 'Self-Introspection',
      description: 'Inner inquiry',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 600, y: 750 },
  },

  {
    id: 'step2-talk',
    type: 'method',
    data: {
      label: 'Talk to Someone',
      description: 'Verbal processing',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 360, y: 850 },
  },

  {
    id: 'step2-brainstorm',
    type: 'method',
    data: {
      label: 'Brainstorm',
      description: 'Out loud exploration',
      color: '#af7ac5',
      category: 'Reading Method',
    },
    position: { x: 540, y: 850 },
  },

  // Somatic Lock Discovery
  {
    id: 'somatic-lock',
    type: 'method',
    data: {
      label: 'Somatic Lock',
      description: 'Precise burden identification',
      color: '#e74c3c',
      category: 'Discovery',
    },
    position: { x: 450, y: 950 },
  },

  {
    id: 'lock-components',
    type: 'method',
    data: {
      label: 'Lock Components',
      description: 'ALL strands of sensation',
      color: '#c0392b',
      category: 'Detail',
    },
    position: { x: 450, y: 1050 },
  },

  // STEP 3: Design Key
  {
    id: 'step3',
    type: 'method',
    data: {
      label: 'STEP 3: Design Key',
      description: 'Cognitive Key Creation',
      color: '#e67e22',
      category: 'Process',
    },
    position: { x: 750, y: 550 },
  },

  {
    id: 'step3-mental',
    type: 'method',
    data: {
      label: 'Pure Mental Key',
      description: 'Cognitive reframe only',
      color: '#f39c12',
      category: 'Key Type',
    },
    position: { x: 700, y: 650 },
  },

  {
    id: 'step3-experimental',
    type: 'method',
    data: {
      label: 'Pure Experimental Key',
      description: 'Action-based verification',
      color: '#f39c12',
      category: 'Key Type',
    },
    position: { x: 900, y: 650 },
  },

  {
    id: 'step3-mixed',
    type: 'method',
    data: {
      label: 'Mixed Key',
      description: 'Thought + Action combined',
      color: '#f39c12',
      category: 'Key Type',
    },
    position: { x: 800, y: 750 },
  },

  // Key Requirements
  {
    id: 'key-precision',
    type: 'method',
    data: {
      label: 'Precision Required',
      description: '100% match to lock',
      color: '#d35400',
      category: 'Requirement',
    },
    position: { x: 750, y: 850 },
  },

  {
    id: 'key-addresses-all',
    type: 'method',
    data: {
      label: 'Addresses ALL Components',
      description: 'Every strand of lock',
      color: '#d35400',
      category: 'Requirement',
    },
    position: { x: 750, y: 950 },
  },

  {
    id: 'key-certainty',
    type: 'method',
    data: {
      label: 'High Certainty',
      description: 'Body must believe it',
      color: '#d35400',
      category: 'Requirement',
    },
    position: { x: 750, y: 1050 },
  },

  // STEP 4: Implementation
  {
    id: 'step4',
    type: 'method',
    data: {
      label: 'STEP 4: Implement',
      description: 'Apply Cognitive Key',
      color: '#27ae60',
      category: 'Process',
    },
    position: { x: 1050, y: 550 },
  },

  {
    id: 'step4-thought',
    type: 'method',
    data: {
      label: 'Repeated Thought',
      description: 'Mental reinforcement',
      color: '#52be80',
      category: 'Implementation',
    },
    position: { x: 1000, y: 650 },
  },

  {
    id: 'step4-action',
    type: 'method',
    data: {
      label: 'Real-World Action',
      description: 'Behavioral execution',
      color: '#52be80',
      category: 'Implementation',
    },
    position: { x: 1180, y: 650 },
  },

  {
    id: 'step4-mixed',
    type: 'method',
    data: {
      label: 'Mixed Implementation',
      description: 'Thought + Action',
      color: '#52be80',
      category: 'Implementation',
    },
    position: { x: 1090, y: 750 },
  },

  // Results
  {
    id: 'result-instant',
    type: 'method',
    data: {
      label: 'Instant Relief',
      description: 'When key matches lock',
      color: '#1abc9c',
      category: 'Result',
    },
    position: { x: 1050, y: 850 },
  },

  {
    id: 'result-aha',
    type: 'method',
    data: {
      label: 'AHA Moment',
      description: '100% certainty achieved',
      color: '#16a085',
      category: 'Result',
    },
    position: { x: 1050, y: 950 },
  },

  {
    id: 'result-unburdened',
    type: 'method',
    data: {
      label: 'Living Unburdened',
      description: 'BS → US transformation',
      color: '#0e6655',
      category: 'Outcome',
    },
    position: { x: 1050, y: 1050 },
  },

  // Key Insights
  {
    id: 'insight-90',
    type: 'method',
    data: {
      label: '90% ≠ Success',
      description: 'Must be 100% precise',
      color: '#34495e',
      category: 'Principle',
    },
    position: { x: 1300, y: 300 },
  },

  {
    id: 'insight-decode-first',
    type: 'method',
    data: {
      label: 'Decode Before Recode',
      description: 'Read body FIRST',
      color: '#34495e',
      category: 'Principle',
    },
    position: { x: 1300, y: 400 },
  },

  {
    id: 'insight-crispr',
    type: 'method',
    data: {
      label: 'Like CRISPR',
      description: 'Precision gene editing for soma',
      color: '#34495e',
      category: 'Analogy',
    },
    position: { x: 1300, y: 500 },
  },

  {
    id: 'insight-divorce',
    type: 'method',
    data: {
      label: 'Divorced at Birth',
      description: 'Mind/Body split is default',
      color: '#34495e',
      category: 'Core Insight',
    },
    position: { x: 1300, y: 600 },
  },
];

const initialEdges: Edge[] = [
  // Main flow
  { id: 'e-title-framework', source: 'title', target: 'framework', animated: true },
  { id: 'e-framework-bs', source: 'framework', target: 'bs-signal' },
  { id: 'e-framework-us', source: 'framework', target: 'us-signal' },
  { id: 'e-framework-grid', source: 'framework', target: 'si-grid', animated: true },
  
  // Grid to quadrants
  { id: 'e-grid-phantom', source: 'si-grid', target: 'phantom-threat' },
  { id: 'e-grid-clear', source: 'si-grid', target: 'clear-threat' },
  { id: 'e-grid-assumed', source: 'si-grid', target: 'assumed-safety' },
  { id: 'e-grid-grounded', source: 'si-grid', target: 'grounded-safety' },

  // Process flow
  { id: 'e-grid-step1', source: 'si-grid', target: 'step1', animated: true, style: { stroke: '#3498db', strokeWidth: 3 } },
  { id: 'e-step1-step2', source: 'step1', target: 'step2', animated: true, style: { stroke: '#9b59b6', strokeWidth: 3 } },
  { id: 'e-step2-step3', source: 'step2', target: 'step3', animated: true, style: { stroke: '#e67e22', strokeWidth: 3 } },
  { id: 'e-step3-step4', source: 'step3', target: 'step4', animated: true, style: { stroke: '#27ae60', strokeWidth: 3 } },

  // Step 1 branches
  { id: 'e-s1-thought', source: 'step1', target: 'step1-thought' },
  { id: 'e-s1-situation', source: 'step1', target: 'step1-real-situation' },
  { id: 'e-s1-sensation', source: 'step1', target: 'step1-sensation' },
  { id: 'e-s1-idea', source: 'step1', target: 'step1-idea' },
  { id: 'e-s1-memory', source: 'step1', target: 'step1-memory' },

  // Step 2 branches
  { id: 'e-s2-walk', source: 'step2', target: 'step2-walk' },
  { id: 'e-s2-journal', source: 'step2', target: 'step2-journal' },
  { id: 'e-s2-therapy', source: 'step2', target: 'step2-therapy' },
  { id: 'e-s2-prayer', source: 'step2', target: 'step2-prayer' },
  { id: 'e-s2-introspection', source: 'step2', target: 'step2-introspection' },
  { id: 'e-s2-talk', source: 'step2', target: 'step2-talk' },
  { id: 'e-s2-brainstorm', source: 'step2', target: 'step2-brainstorm' },

  // Lock discovery
  { id: 'e-s2-lock', source: 'step2', target: 'somatic-lock', animated: true },
  { id: 'e-lock-components', source: 'somatic-lock', target: 'lock-components' },

  // Step 3 branches
  { id: 'e-s3-mental', source: 'step3', target: 'step3-mental' },
  { id: 'e-s3-experimental', source: 'step3', target: 'step3-experimental' },
  { id: 'e-s3-mixed', source: 'step3', target: 'step3-mixed' },

  // Key requirements
  { id: 'e-s3-precision', source: 'step3', target: 'key-precision' },
  { id: 'e-s3-addresses', source: 'step3', target: 'key-addresses-all' },
  { id: 'e-s3-certainty', source: 'step3', target: 'key-certainty' },

  // Step 4 branches
  { id: 'e-s4-thought', source: 'step4', target: 'step4-thought' },
  { id: 'e-s4-action', source: 'step4', target: 'step4-action' },
  { id: 'e-s4-mixed', source: 'step4', target: 'step4-mixed' },

  // Results
  { id: 'e-s4-instant', source: 'step4', target: 'result-instant', animated: true },
  { id: 'e-instant-aha', source: 'result-instant', target: 'result-aha' },
  { id: 'e-aha-unburdened', source: 'result-aha', target: 'result-unburdened' },

  // Connect lock to key
  { id: 'e-lock-key', source: 'lock-components', target: 'step3', style: { stroke: '#e74c3c', strokeWidth: 2, strokeDasharray: '5,5' } },

  // Insights connections
  { id: 'e-insight-90', source: 'key-precision', target: 'insight-90', type: 'straight', style: { stroke: '#95a5a6' } },
  { id: 'e-insight-decode', source: 'somatic-lock', target: 'insight-decode-first', type: 'straight', style: { stroke: '#95a5a6' } },
];

export default function CompleteCipherDiagram() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
    
    // Highlight connected nodes
    const connectedNodeIds = edges
      .filter(e => e.source === node.id || e.target === node.id)
      .flatMap(e => [e.source, e.target])
      .filter(id => id !== node.id);

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: {
          ...n.style,
          opacity: connectedNodeIds.includes(n.id) || n.id === node.id ? 1 : 0.3,
        },
      }))
    );
  }, [edges, setNodes]);

  const resetHighlight = () => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: { ...n.style, opacity: 1 },
      }))
    );
    setSelectedNode(null);
  };

  const filterBySearch = () => {
    if (!searchTerm) {
      resetHighlight();
      return;
    }

    setNodes((nds) =>
      nds.map((n) => {
        const data = n.data as NodeData;
        const matches = 
          data.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          data.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          data.category.toLowerCase().includes(searchTerm.toLowerCase());

        return {
          ...n,
          style: { ...n.style, opacity: matches ? 1 : 0.2 },
        };
      })
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
        minZoom={0.1}
        maxZoom={2}
      >
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as NodeData;
            return data?.color || '#999';
          }}
          style={{ background: '#f8f9fa' }}
        />
        <Controls />
        <Background gap={20} size={1} color="#e0e0e0" />

        {/* Top Controls */}
        <Panel position="top-left" style={{ background: 'white', padding: '12px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>CIPHER Method Explorer</div>
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyUp={filterBySearch}
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }}
          />
          <button onClick={resetHighlight} style={{ marginLeft: '8px', padding: '6px 12px', borderRadius: '4px', border: 'none', background: '#3498db', color: 'white', cursor: 'pointer' }}>
            Reset
          </button>
        </Panel>

        {/* Node Info Panel */}
        {selectedNode && (
          <Panel position="top-right" style={{ background: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '300px' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#2c3e50' }}>
              {(selectedNode.data as NodeData).label}
            </h3>
            <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '8px', fontStyle: 'italic' }}>
              {(selectedNode.data as NodeData).category}
            </div>
            {(selectedNode.data as NodeData).description && (
              <p style={{ fontSize: '13px', color: '#34495e', lineHeight: 1.5 }}>
                {(selectedNode.data as NodeData).description}
              </p>
            )}
            {(selectedNode.data as NodeData).wikiUrl && (
              <a href={(selectedNode.data as NodeData).wikiUrl} style={{ fontSize: '12px', color: '#3498db' }}>
                Learn more →
              </a>
            )}
          </Panel>
        )}

        {/* Legend */}
        <Panel position="bottom-left" style={{ background: 'white', padding: '12px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px' }}>Legend</div>
          <div style={{ fontSize: '11px', lineHeight: 1.8 }}>
            <div><span style={{ color: '#3498db' }}>●</span> Step 1: Immerse</div>
            <div><span style={{ color: '#9b59b6' }}>●</span> Step 2: Read Signal</div>
            <div><span style={{ color: '#e67e22' }}>●</span> Step 3: Design Key</div>
            <div><span style={{ color: '#27ae60' }}>●</span> Step 4: Implement</div>
            <div><span style={{ color: '#e74c3c' }}>●</span> BS (Burden Signal)</div>
            <div><span style={{ color: '#27ae60' }}>●</span> US (Unburden Signal)</div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
