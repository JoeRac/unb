// src/App.tsx
import React, { useCallback, useState, DragEvent } from 'react';
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
  XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ColorPicker, ColorResult } from '@hello-pangea/color-picker'; // Optional: keep if installed

// Define data shapes for custom nodes
interface CustomNodeData {
  label: string;
  color?: string;
  shape?: 'rect' | 'circle' | 'diamond';
}

interface ResizableNodeData {
  label: string;
}

// Custom Node with proper typing
const CustomNode = ({ data, isConnectable }: NodeProps<Node<CustomNodeData>>) => (
  <div
    style={{
      padding: 10,
      border: `2px solid ${data.color ?? '#ff0072'}`,
      borderRadius: data.shape === 'circle' ? '50%' : data.shape === 'diamond' ? '10px' : '5px',
      background: '#fff',
      transform: data.shape === 'diamond' ? 'rotate(45deg)' : 'none',
      width: data.shape === 'diamond' ? 80 : 'auto',
      height: data.shape === 'diamond' ? 80 : 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
    {data.label}
    <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
  </div>
);

// Resizable Node
const ResizableNode = ({ data, selected }: NodeProps<Node<ResizableNodeData>>) => (
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

// Color Changer Node (optional color picker)
const ColorChangerNode = ({ id, data }: NodeProps<Node<{ color: string }>>) => {
  const { setNodes } = useReactFlow();

  const handleColorChange = (color: ColorResult) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, color: color.hex } } : n
      )
    );
  };

  return (
    <div style={{ padding: 10, border: '1px solid gray', background: '#fff' }}>
      Color Picker Node
      <ColorPicker value={data.color} onChange={handleColorChange} />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
  resizable: ResizableNode,
  colorChanger: ColorChangerNode,
} as const; // 'as const' helps TypeScript infer exact types

// Initial nodes/edges (same as before, but typed data)
const initialNodes: Node[] = [
  { id: '1', type: 'custom', position: { x: 100, y: 100 }, data: { label: 'Basic Node', color: '#ff0072', shape: 'rect' } },
  { id: '2', type: 'custom', position: { x: 300, y: 100 }, data: { label: 'Circle Node', color: '#00ff72', shape: 'circle' } },
  { id: '3', type: 'custom', position: { x: 500, y: 100 }, data: { label: 'Diamond Node', color: '#0072ff', shape: 'diamond' } },
  { id: '4', type: 'resizable', position: { x: 100, y: 300 }, data: { label: 'Resizable Node' } },
  { id: '5', type: 'colorChanger', position: { x: 300, y: 300 }, data: { color: '#ffffff' } },
  { id: '6', position: { x: 500, y: 300 }, data: { label: 'Hover to Change Color' } },
  { id: '7', position: { x: 100, y: 500 }, data: { label: 'Undo/Redo Target' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', label: 'Smooth Edge', animated: true },
  { id: 'e2-3', source: '2', target: '3', type: 'bezier', label: 'Bezier Edge', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-4', source: '3', target: '4', type: 'step', label: 'Step Edge' },
  { id: 'e4-5', source: '4', target: '5', type: 'straight', label: 'Straight Edge' },
  { id: 'e5-6', source: '5', target: '6' },
  { id: 'e6-7', source: '6', target: '7' },
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView, zoomIn, zoomOut, project } = useReactFlow(); // Added project for accurate drop positions
  const [bgVariant, setBgVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: typeof initialEdges }[]>([{ nodes: initialNodes, edges: initialEdges }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === node.id && 'color' in n.data
          ? { ...n, data: { ...n.data, color: n.data.color === '#ff0072' ? '#00ff72' : '#ff0072' } }
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

  const addNode = useCallback((type: keyof typeof nodeTypes) => {
    const newNode: Node = {
      id: `${nodes.length + 1}`,
      type,
      position: { x: Math.random() * 500, y: Math.random() * 500 },
      data: type === 'custom' ? { label: 'Custom Node', color: '#ccc', shape: 'rect' } :
            type === 'resizable' ? { label: 'Resizable' } :
            { color: '#ffffff' },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes, setNodes]);

  const saveState = () => localStorage.setItem('react-flow-state', JSON.stringify({ nodes, edges }));
  const loadState = () => {
    const saved = localStorage.getItem('react-flow-state');
    if (saved) {
      const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
      setNodes(savedNodes);
      setEdges(savedEdges);
    }
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: keyof typeof nodeTypes) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as keyof typeof nodeTypes;
      if (!type) return;

      // Use project() for accurate position relative to the flow viewport
      const position = project({ x: event.clientX, y: event.clientY });

      const newNode: Node = {
        id: `${nodes.length + 1}`,
        type,
        position,
        data: type === 'custom' ? { label: 'Custom Node', color: '#ccc', shape: 'rect' } :
              type === 'resizable' ? { label: 'Resizable' } :
              { color: '#ffffff' },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes, setNodes, project]
  );

  return (
    <div style={{ width: '100vw', height: '100vh' }} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
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
          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
          <button onClick={saveState}>Save</button>
          <button onClick={loadState}>Load</button>
          <select value={bgVariant} onChange={(e) => setBgVariant(e.target.value as BackgroundVariant)}>
            <option value={BackgroundVariant.Dots}>Dots</option>
            <option value={BackgroundVariant.Lines}>Lines</option>
            <option value={BackgroundVariant.Cross}>Cross</option>
          </select>
        </Panel>
        <Panel position="top-right">
          <div>Drag to add:</div>
          <div draggable onDragStart={(e) => onDragStart(e, 'custom')} style={{ padding: 5, border: '1px solid #ccc', margin: 5 }}>Custom Node</div>
          <div draggable onDragStart={(e) => onDragStart(e, 'resizable')} style={{ padding: 5, border: '1px solid #ccc', margin: 5 }}>Resizable Node</div>
          <div draggable onDragStart={(e) => onDragStart(e, 'colorChanger')} style={{ padding: 5, border: '1px solid #ccc', margin: 5 }}>Color Changer</div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default App;
