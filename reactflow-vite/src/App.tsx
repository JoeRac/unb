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
  Panel,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type NodeData = {
  label: string;
  color: string;
  category: string;

  
  // Text
  description?: string;
  details?: string;
  longDescription?: string;

  // Links
  wikiUrl?: string;
  externalLinks?: { label: string; url: string }[];

  // Images
  images?: { src: string; alt?: string }[];

  // Video (YouTube / Vimeo / hosted)
  video?: {
    type: 'youtube' | 'vimeo' | 'html5';
    url: string;
  };
};

function MethodNode(props: any) {
  const data = props.data as NodeData;
  const selected = props.selected as boolean;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: props.style?.background,
        color: props.style?.color,
        minWidth: 160,
        maxWidth: 200,
        boxShadow: selected
          ? '0 0 0 3px #ffd700, 0 8px 24px rgba(0,0,0,0.3)'
          : '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'all 0.3s ease',
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
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} isConnectable={false} />
      <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 10, opacity: 0.8, fontStyle: 'italic' }}>
          {data.category}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { method: MethodNode };

const initialNodes: Node[] = [
  {
  id: 'title',
  type: 'method',
  position: { x: 600, y: 0 },
  data: {
    label: 'CIPHER METHOD',
    color: '#1a1a2e',
    category: 'Framework',

    description: 'High-precision unburdening framework',

    longDescription:
      'The Cipher Method is a structured system for decoding internal resistance patterns and producing permanent somatic resolution.',

    wikiUrl: 'https://example.com/cipher',

    externalLinks: [
      { label: 'Scientific Basis', url: 'https://example.com/research' },
      { label: 'Full Course', url: 'https://example.com/course' }
    ],

    images: [
      { src: '/images/cipher-overview.png', alt: 'Cipher Overview' },
      { src: '/images/somatic-grid.png', alt: 'Somatic Grid' }
    ],

    video: {
      type: 'youtube',
      url: 'https://www.youtube.com/embed/VIDEO_ID'
    }
  }
},
  { id: 'framework', type: 'method', hidden: true, position: { x: 600, y: 100 }, data: { label: 'Somatic Intelligence Model', color: '#16213e', category: 'Core Theory' } },
  { id: 'bs-signal', type: 'method', hidden: true, position: { x: 400, y: 200 }, data: { label: 'BS (Burden Signal)', color: '#e74c3c', category: 'Signal Type', wikiUrl: 'https://example.com/bs' } },
  { id: 'us-signal', type: 'method', hidden: true, position: { x: 800, y: 200 }, data: { label: 'US (Unburden Signal)', color: '#27ae60', category: 'Signal Type' } },
  { id: 'si-grid', type: 'method', hidden: true, position: { x: 600, y: 300 }, data: { label: 'Somatic Intelligence Grid', color: '#8e44ad', category: 'Assessment' } },
  { id: 'phantom-threat', type: 'method', hidden: true, position: { x: 350, y: 400 }, data: { label: 'Phantom Threat', color: '#e67e22', category: 'Quadrant' } },
  { id: 'clear-threat', type: 'method', hidden: true, position: { x: 550, y: 400 }, data: { label: 'Clear Threat', color: '#c0392b', category: 'Quadrant' } },
  { id: 'assumed-safety', type: 'method', hidden: true, position: { x: 750, y: 400 }, data: { label: 'Assumed Safety', color: '#f39c12', category: 'Quadrant' } },
  { id: 'grounded-safety', type: 'method', hidden: true, position: { x: 950, y: 400 }, data: { label: 'Grounded Safety', color: '#27ae60', category: 'Quadrant' } },
  { id: 'step1', type: 'method', hidden: true, position: { x: 150, y: 550 }, data: { label: 'STEP 1: Immerse', color: '#3498db', category: 'Process', wikiUrl: 'https://example.com/step1' } },
  { id: 'step2', type: 'method', hidden: true, position: { x: 450, y: 550 }, data: { label: 'STEP 2: Read Signal', color: '#9b59b6', category: 'Process' } },
  { id: 'step3', type: 'method', hidden: true, position: { x: 750, y: 550 }, data: { label: 'STEP 3: Design Key', color: '#e67e22', category: 'Process' } },
  { id: 'step4', type: 'method', hidden: true, position: { x: 1050, y: 550 }, data: { label: 'STEP 4: Implement', color: '#27ae60', category: 'Process' } },
  { id: 'step1-thought', type: 'method', hidden: true, position: { x: 0, y: 650 }, data: { label: 'Thought', color: '#5dade2', category: 'Experience Type' } },
  { id: 'step1-situation', type: 'method', hidden: true, position: { x: 180, y: 650 }, data: { label: 'Real Situation', color: '#5dade2', category: 'Experience Type' } },
  { id: 'step1-sensation', type: 'method', hidden: true, position: { x: 0, y: 750 }, data: { label: 'Sensation', color: '#5dade2', category: 'Experience Type' } },
  { id: 'step1-memory', type: 'method', hidden: true, position: { x: 180, y: 750 }, data: { label: 'Memory', color: '#5dade2', category: 'Experience Type' } },
  { id: 'step2-journal', type: 'method', hidden: true, position: { x: 360, y: 650 }, data: { label: 'Journal', color: '#af7ac5', category: 'Reading Method' } },
  { id: 'step2-walk', type: 'method', hidden: true, position: { x: 540, y: 650 }, data: { label: 'Go for Walk', color: '#af7ac5', category: 'Reading Method' } },
  { id: 'step2-therapy', type: 'method', hidden: true, position: { x: 360, y: 750 }, data: { label: 'Talk Therapy', color: '#af7ac5', category: 'Reading Method' } },
  { id: 'somatic-lock', type: 'method', hidden: true, position: { x: 450, y: 850 }, data: { label: 'Somatic Lock', color: '#e74c3c', category: 'Discovery' } },
  { id: 'step3-mental', type: 'method', hidden: true, position: { x: 700, y: 650 }, data: { label: 'Pure Mental Key', color: '#f39c12', category: 'Key Type' } },
  { id: 'step3-experimental', type: 'method', hidden: true, position: { x: 900, y: 650 }, data: { label: 'Pure Experimental', color: '#f39c12', category: 'Key Type' } },
  { id: 'step3-mixed', type: 'method', hidden: true, position: { x: 800, y: 750 }, data: { label: 'Mixed Key', color: '#f39c12', category: 'Key Type' } },
  { id: 'step4-thought', type: 'method', hidden: true, position: { x: 1000, y: 650 }, data: { label: 'Repeated Thought', color: '#52be80', category: 'Implementation' } },
  { id: 'step4-action', type: 'method', hidden: true, position: { x: 1180, y: 650 }, data: { label: 'Real-World Action', color: '#52be80', category: 'Implementation' } },
  { id: 'result-instant', type: 'method', hidden: true, position: { x: 1050, y: 850 }, data: { label: 'Instant Relief', color: '#1abc9c', category: 'Result' } },
  { id: 'result-unburdened', type: 'method', hidden: true, position: { x: 1050, y: 950 }, data: { label: 'Living Unburdened', color: '#0e6655', category: 'Outcome' } },
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
  { id: 'e9', source: 'si-grid', target: 'step1', animated: true },
  { id: 'e10', source: 'step1', target: 'step2', animated: true },
  { id: 'e11', source: 'step2', target: 'step3', animated: true },
  { id: 'e12', source: 'step3', target: 'step4', animated: true },
  { id: 'e13', source: 'step1', target: 'step1-thought' },
  { id: 'e14', source: 'step1', target: 'step1-situation' },
  { id: 'e15', source: 'step1', target: 'step1-sensation' },
  { id: 'e16', source: 'step1', target: 'step1-memory' },
  { id: 'e17', source: 'step2', target: 'step2-journal' },
  { id: 'e18', source: 'step2', target: 'step2-walk' },
  { id: 'e19', source: 'step2', target: 'step2-therapy' },
  { id: 'e20', source: 'step2', target: 'somatic-lock' },
  { id: 'e21', source: 'step3', target: 'step3-mental' },
  { id: 'e22', source: 'step3', target: 'step3-experimental' },
  { id: 'e23', source: 'step3', target: 'step3-mixed' },
  { id: 'e24', source: 'step4', target: 'step4-thought' },
  { id: 'e25', source: 'step4', target: 'step4-action' },
  { id: 'e26', source: 'step4', target: 'result-instant' },
  { id: 'e27', source: 'result-instant', target: 'result-unburdened' },
];

const paths = {
  'Complete Overview': ['title', 'framework', 'bs-signal', 'us-signal', 'si-grid', 'phantom-threat', 'clear-threat', 'assumed-safety', 'grounded-safety'],
  'Full Process Flow': ['title', 'framework', 'si-grid', 'step1', 'step2', 'step3', 'step4', 'result-instant', 'result-unburdened'],
  'Step 1: Immerse Options': ['title', 'framework', 'si-grid', 'step1', 'step1-thought', 'step1-situation', 'step1-sensation', 'step1-memory'],
  'Step 2: Reading Methods': ['title', 'framework', 'si-grid', 'step1', 'step2', 'step2-journal', 'step2-walk', 'step2-therapy', 'somatic-lock'],
  'Step 3: Key Design': ['title', 'framework', 'si-grid', 'step1', 'step2', 'step3', 'step3-mental', 'step3-experimental', 'step3-mixed'],
  'Step 4: Implementation': ['title', 'framework', 'si-grid', 'step1', 'step2', 'step3', 'step4', 'step4-thought', 'step4-action'],
  'Burden Signal Path': ['title', 'framework', 'bs-signal', 'si-grid', 'phantom-threat', 'clear-threat'],
  'Unburden Signal Path': ['title', 'framework', 'us-signal', 'si-grid', 'assumed-safety', 'grounded-safety'],
  'Full Journey to Relief': ['title', 'framework', 'si-grid', 'step1', 'step1-thought', 'step2', 'step2-journal', 'somatic-lock', 'step3', 'step3-mental', 'step4', 'step4-thought', 'result-instant', 'result-unburdened'],
  'Quadrant Deep Dive': ['title', 'framework', 'si-grid', 'phantom-threat', 'clear-threat', 'assumed-safety', 'grounded-safety'],
};

function DiagramContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      setSelectedNode(node);
    },
    []
  );

  const showPath = (pathName: string) => {
    const pathNodes = paths[pathName as keyof typeof paths];
    setActivePath(pathName);
    const highlightColor = '#1976d2'; // brighter blue
    const paleColor = '#b0b0b0'; // darker gray
    setNodes((nds) =>
      nds.map((n) => {
        const isActive = pathNodes.includes(n.id);
        return {
          ...n,
          style: {
            background: isActive ? highlightColor : paleColor,
            color: isActive ? '#fff' : '#666',
            opacity: isActive ? 1 : 0.35,
            fontSize: isActive ? 18 : 13,
            minWidth: isActive ? 180 : 140,
            maxWidth: isActive ? 220 : 160,
            boxShadow: isActive ? '0 0 0 4px #1976d2, 0 8px 24px rgba(0,0,0,0.25)' : 'none',
            transform: isActive ? 'scale(1.08)' : 'scale(0.95)',
            transition: 'all 0.4s cubic-bezier(.4,2,.3,1)',
          },
        };
      })
    );
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => {
          const isActive = pathNodes.includes(n.id);
          return {
            ...n,
            hidden: false,
            style: {
              background: isActive ? highlightColor : paleColor,
              color: isActive ? '#fff' : '#666',
              opacity: isActive ? 1 : 0.35,
              fontSize: isActive ? 18 : 13,
              minWidth: isActive ? 180 : 140,
              maxWidth: isActive ? 220 : 160,
              boxShadow: isActive ? '0 0 0 4px #1976d2, 0 8px 24px rgba(0,0,0,0.25)' : 'none',
              transform: isActive ? 'scale(1.08)' : 'scale(0.95)',
              transition: 'all 0.4s cubic-bezier(.4,2,.3,1)',
            },
          };
        })
      );
      setTimeout(() => {
        fitView({ 
          duration: 600,
          padding: 0.2,
        });
      }, 50);
    }, 400);
    // Also update edge styles
    setEdges((eds: Edge[]) =>
      eds.map((e: Edge) => {
        const isActive = pathNodes.includes(e.source) && pathNodes.includes(e.target);
        return {
          ...e,
          style: {
            stroke: isActive ? highlightColor : paleColor,
            opacity: isActive ? 1 : 0.25,
            strokeWidth: isActive ? 3 : 1.5,
            transition: 'all 0.4s cubic-bezier(.4,2,.3,1)',
          },
        };
      })
    );
  };

  const resetView = () => {
    setActivePath(null);
    
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: {
          ...n.style,
          opacity: 0,
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        },
      }))
    );

    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          hidden: n.id !== 'title',
          style: {
            ...n.style,
            opacity: 1,
          },
        }))
      );
      
      setTimeout(() => {
        fitView({ 
          duration: 600,
          padding: 0.2,
        });
      }, 50);
    }, 400);
  };

  const showAll = () => {
    setActivePath('All Nodes');
    
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        hidden: false,
        style: {
          ...n.style,
          opacity: 0,
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        },
      }))
    );

    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n, index) => ({
          ...n,
          style: {
            ...n.style,
            opacity: 1,
            transitionDelay: `${index * 0.02}s`,
          },
        }))
      );
      
      setTimeout(() => {
        fitView({ 
          duration: 800,
          padding: 0.1,
        });
      }, 100);
    }, 50);
  };

  const selectedNodeData = selectedNode ? (selectedNode.data as NodeData) : null;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodesDraggable={true}
        fitView
      >
        <MiniMap nodeColor={(n) => ((n.data as NodeData).color) || '#fff'} />
        <Controls />
        <Background color="#222" gap={16} />

        <Panel position="top-left" style={{ 
          background: 'rgba(255,255,255,0.95)', 
          padding: '16px', 
          borderRadius: '8px',
          maxHeight: '90vh',
          overflowY: 'auto',
          width: '220px'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#333' }}>📊 Explore Paths</h3>
          
          <button
            onClick={resetView}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              background: activePath === null ? '#3498db' : '#ecf0f1',
              color: activePath === null ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease'
            }}
          >
            🔄 Reset View
          </button>

          <button
            onClick={showAll}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '12px',
              background: activePath === 'All Nodes' ? '#3498db' : '#ecf0f1',
              color: activePath === 'All Nodes' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease'
            }}
          >
            🌐 Show All
          </button>

          {Object.keys(paths).map((pathName) => (
            <button
              key={pathName}
              onClick={() => showPath(pathName)}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '6px',
                background: activePath === pathName ? '#3498db' : 'white',
                color: activePath === pathName ? 'white' : '#333',
                border: activePath === pathName ? 'none' : '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '11px',
                textAlign: 'left',
                transition: 'all 0.3s ease',
                fontWeight: activePath === pathName ? 'bold' : 'normal',
                transform: activePath === pathName ? 'translateX(4px)' : 'translateX(0)'
              }}
              onMouseEnter={(e) => {
                if (activePath !== pathName) {
                  e.currentTarget.style.background = '#e8f4f8';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }
              }}
              onMouseLeave={(e) => {
                if (activePath !== pathName) {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.transform = 'translateX(0)';
                }
              }}
            >
              {pathName}
            </button>
          ))}
        </Panel>

        {selectedNode && selectedNodeData && (
  <Panel
    position="top-right"
    style={{
      background: 'white',
      padding: '20px',
      borderRadius: '10px',
      width: '360px',
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      color: '#333',
    }}
  >
    <button
      onClick={() => setSelectedNode(null)}
      style={{
        float: 'right',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '18px'
      }}
    >
      ✕
    </button>

    <h2 style={{ marginTop: 0, color: selectedNodeData.color }}>
      {selectedNodeData.label}
    </h2>

    <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: 12 }}>
      {selectedNodeData.category}
    </div>

    {selectedNodeData.longDescription && (
      <p style={{ lineHeight: 1.6 }}>
        {selectedNodeData.longDescription}
      </p>
    )}

    {/* Images */}
    {selectedNodeData.images?.map((img) => (
      <img
        key={img.src}
        src={img.src}
        alt={img.alt || ''}
        style={{
          width: '100%',
          borderRadius: 8,
          marginTop: 12
        }}
      />
    ))}

    {/* Video */}
    {selectedNodeData.video && (
      <iframe
        src={selectedNodeData.video.url}
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 8,
          marginTop: 16
        }}
        allowFullScreen
      />
    )}

    {/* External links */}
    {selectedNodeData.externalLinks?.length && (
      <div style={{ marginTop: 16 }}>
        {selectedNodeData.externalLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              marginBottom: 8,
              color: '#3498db',
              fontWeight: 'bold'
            }}
          >
            {link.label} ↗
          </a>
        ))}
      </div>
    )}

    {/* Wiki */}
    {selectedNodeData.wikiUrl && (
      <a
        href={selectedNodeData.wikiUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          marginTop: 20,
          padding: 10,
          background: '#3498db',
          color: 'white',
          textAlign: 'center',
          borderRadius: 6,
          fontWeight: 'bold',
          textDecoration: 'none'
        }}
      >
        Open Documentation
      </a>
    )}
  </Panel>
)}
      </ReactFlow>
    </div>
  );
}

export default function InteractiveDiagram() {
  return (
    <ReactFlowProvider>
      <DiagramContent />
    </ReactFlowProvider>
  );
}
