// src/App.tsx
import React, { useCallback, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  Panel,
  BackgroundVariant,
  NodeProps,
  Node,
  Edge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Custom Node Type with proper typing
type CustomNodeData = {
  label: string;
  color: string;
  shape: 'rect' | 'circle' | 'diamond';
  [key: string]: unknown; // For Record compatibility
};

type ResizableNodeData = {
  label: string;
  [key: string]: unknown;
};

const CustomNode: React.FC<NodeProps<Node<CustomNodeData>>> = ({ data, isConnectable }) => (
  <div
    style={{
      padding: 10,
      border: `2px solid ${data.color}`,
      borderRadius: data.shape === 'circle' ? '50%' : data.shape === 'diamond' ? '10px' : '5px',
      background: '#fff',
      transform: data.shape === 'diamond' ? 'rotate(45deg)' : 'none',
      width: data.shape === 'diamond' ? 100 : 'auto',
      height: data.shape === 'diamond' ? 100 : 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
    {data.label}
    <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
  </div>
);

const ResizableNode: React.FC<NodeProps<Node<ResizableNodeData>>> = ({ data, selected }) => (
  <div
    style={{
      padding: 10,
      border: selected ? '2px dashed blue' : '1px solid black',
      resize: 'both',
      overflow: 'auto',
      minWidth: 100,
      minHeight: 50,
      background: '#f0f0f0',
    }}
  >
    {data.label} (Resize me!)
  </div>
);

const nodeTypes = {
  custom: CustomNode,
  resizable: ResizableNode,
};

// Initial elaborate diagram
const initialNodes: Node[] = [
  { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Start Node', color: '#ff0072', shape: 'rect' } },
  { id: '2', type: 'custom', position: { x: 200, y: 0 }, data: { label: 'Circle Node', color: '#00ff72', shape: 'circle' } },
  { id: '3', type: 'custom', position: { x: 400, y: 0 }, data: { label: 'Diamond Node', color: '#0072ff', shape: 'diamond' } },
  { id: '4', type: 'resizable', position: { x: 0, y: 200 }, data: { label: 'Resizable' } },
  { id: '5', position: { x: 200, y: 200 }, data: { label: 'Dynamic Add Target' } },
  { id: '6', position: { x: 400, y: 200 }, data: { label: 'Undo/Redo Demo' } },
  { id: '7', position: { x: 0, y: 400 }, data: { label: 'Save/Load Node' } },
  { id: '8', position: { x: 200, y: 400 }, data: { label: 'Zoom/View Change' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', animated: true, label: 'Smooth' },
  { id: 'e2-3', source: '2', target: '3', type: 'bezier', label: 'Bezier', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-4', source: '3', target: '4', type: 'step', label: 'Step' },
  { id: 'e4-5', source: '4', target: '5', type: 'straight', label: 'Straight' },
  { id: 'e5-6', source: '5', target: '6' },
  { id: 'e6-7', source: '6', target: '7' },
  { id: 'e7-8', source: '7', target: '8' },
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();
  const [bgVariant, setBgVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([{ nodes: initialNodes, edges: initialEdges }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds)), [setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === node.id && n.type === 'custom'
          ? { ...n, data: { ...n.data, color: (n.data as CustomNodeData).color === '#ff0072' ? '#00ff72' : '#ff0072' } }
          : n
      )
    );
  }, [setNodes]);

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === node.id && n.type === 'custom'
          ? { ...n, data: { ...n.data, shape: (n.data as CustomNodeData).shape === 'rect' ? 'circle' : (n.data as CustomNodeData).shape === 'circle' ? 'diamond' : 'rect' } }
          : n
      )
    );
  }, [setNodes]);

  const onNodeDragStop = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes, edges });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [nodes, edges, history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setNodes(history[historyIndex - 1].nodes);
      setEdges(history[historyIndex - 1].edges);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setNodes(history[historyIndex + 1].nodes);
      setEdges(history[historyIndex + 1].edges);
    }
  };

  const addCustomNode = useCallback(() => {
    const newNode: Node = {
      id: `${nodes.length + 1}`,
      type: 'custom',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `New Custom Node ${nodes.length + 1}`, color: '#ccc', shape: 'rect' },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [nodes, setNodes]);

  const addResizableNode = useCallback(() => {
    const newNode: Node = {
      id: `${nodes.length + 1}`,
      type: 'resizable',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `New Resizable ${nodes.length + 1}` },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [nodes, setNodes]);

  const removeLastNode = useCallback(() => {
    setNodes((nds) => nds.slice(0, -1));
  }, [setNodes]);

  const saveState = () => localStorage.setItem('react-flow-demo', JSON.stringify({ nodes, edges }));

  const loadState = () => {
    const saved = localStorage.getItem('react-flow-demo');
    if (saved) {
      const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
      setNodes(savedNodes);
      setEdges(savedEdges);
    }
  };

  const autoLayout = useCallback(() => {
    // Simple force-directed layout demo (adjust positions roughly)
    setNodes((nds) =>
      nds.map((n, i) => ({
        ...n,
        position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 200 },
      }))
    );
  }, [setNodes]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background variant={bgVariant} gap={12} size={1} />
        <MiniMap />
        <Controls />
        <Panel position="top-left">
          <button onClick={() => fitView({ duration: 500 })}>Fit View</button>
          <button onClick={zoomIn}>Zoom In</button>
          <button onClick={zoomOut}>Zoom Out</button>
          <button onClick={autoLayout}>Auto Layout</button>
          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
          <button onClick={saveState}>Save</button>
          <button onClick={loadState}>Load</button>
        </Panel>
        <Panel position="top-right">
          <button onClick={addCustomNode}>Add Custom Node</button>
          <button onClick={addResizableNode}>Add Resizable Node</button>
          <button onClick={removeLastNode}>Remove Last Node</button>
          <select value={bgVariant} onChange={(e) => setBgVariant(Number(e.target.value) as BackgroundVariant)}>
            <option value={BackgroundVariant.Dots}>Dots</option>
            <option value={BackgroundVariant.Lines}>Lines</option>
            <option value={BackgroundVariant.Cross}>Cross</option>
          </select>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default App;
