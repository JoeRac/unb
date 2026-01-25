import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 240;
const nodeHeight = 80;

function getLayoutedNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: 'TB' | 'LR' = 'TB'
): FlowNode[] {
  dagreGraph.setGraph({ rankdir: direction });
  nodes.forEach((node: FlowNode) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  edges.forEach((edge: FlowEdge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);
  return nodes.map((node: FlowNode) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
}
import { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  ReactFlow,
  Controls,
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

type SheetRow = {
  id?: string;
  parentId?: string;
  label?: string;
  category?: string;
  color?: string;
  wikiUrl?: string;
  description?: string;
  details?: string;
  longDescription?: string;
  externalLinks?: string;
  images?: string;
  video?: string;
  hidden_by_default?: string | boolean;
};

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/gviz/tq?tqx=out:csv';

function MethodNode(props: any) {
  const data = props.data as NodeData;
  const selected = props.selected as boolean;
  const background = props.style?.background ?? data.color ?? '#1f2937';
  const color = props.style?.color ?? '#fff';
  const opacity = props.style?.opacity ?? 1;
  const boxShadow =
    props.style?.boxShadow ??
    (selected
      ? '0 0 0 4px #1976d2, 0 8px 24px 0 rgba(0,0,0,0.18)'
      : '0 2px 12px 0 rgba(30,30,40,0.10)');
  const transition = props.style?.transition ?? 'all 0.3s ease';

  return (
    <div
      style={{
        padding: props.style?.boxHighlight ? 20 : 12,
        fontSize: props.style?.boxHighlight ? 18 : 13,
        borderRadius: 18,
        background,
        color,
        opacity,
        minWidth: props.style?.boxHighlight ? 200 : 160,
        maxWidth: props.style?.boxHighlight ? 260 : 200,
        boxShadow,
        transition,
        cursor: 'pointer',
        // Remove border to avoid square outline
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555', opacity: 0, width: 0, height: 0 }}
        isConnectable={false}
      />
      <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 10, opacity: 0.8, fontStyle: 'italic' }}>
          {data.category}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555', opacity: 0, width: 0, height: 0 }}
        isConnectable={false}
      />
    </div>
  );
}

const nodeTypes = { method: MethodNode };

const initialNodes: Node[] = [];

const initialEdges: Edge[] = [];

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
  const layoutDirections = useMemo(
    () => [
      { label: 'Top-Bottom', value: 'TB' },
      { label: 'Bottom-Top', value: 'BT' },
      { label: 'Left-Right', value: 'LR' },
      { label: 'Right-Left', value: 'RL' },
    ],
    []
  );
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
    // Toggle layout direction
    const toggleLayout = () => {
      const nextIndex = (layoutIndex + 1) % layoutDirections.length;
      setLayoutIndex(nextIndex);
      setNodes((nds) => getLayoutedNodes(nds, edges, layoutDirections[nextIndex].value as 'TB'));
    };
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [mode, setMode] = useState<'guided' | 'manual'>('guided');
  const [manualHighlights, setManualHighlights] = useState<Set<string>>(new Set());
  const [baseNodes, setBaseNodes] = useState<Node[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  const highlightColor = '#1976d2';
  const paleColor = '#e5e7eb';
  const guidedActiveStyle = {
    background: highlightColor,
    color: '#fff',
    opacity: 1,
    boxShadow: `0 0 0 4px ${highlightColor}, 0 8px 24px rgba(0,0,0,0.25)`,
    borderRadius: 18,
    overflow: 'hidden',
    boxHighlight: true,
    transition: 'background 0.4s ease, color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease',
  };
  const guidedInactiveStyle = {
    background: paleColor,
    color: '#666',
    opacity: 0.35,
    boxShadow: 'none',
    borderRadius: 18,
    overflow: 'hidden',
    boxHighlight: false,
    transition: 'background 0.4s ease, color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease',
  };

  const layoutNodes = useCallback(
    (nodesToLayout: Node[], edgesToLayout: Edge[]) =>
      getLayoutedNodes(nodesToLayout, edgesToLayout, layoutDirections[layoutIndex].value as 'TB'),
    [layoutIndex, layoutDirections]
  );

  const parseHidden = (value?: string | boolean) => {
    if (typeof value === 'boolean') return value;
    if (!value) return false;
    return value.toString().trim().toLowerCase() === 'true';
  };

  const parseJsonArray = <T,>(value?: string): T[] | undefined => {
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : undefined;
    } catch {
      return undefined;
    }
  };

  const parseJsonObject = <T,>(value?: string): T | undefined => {
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? (parsed as T) : undefined;
    } catch {
      return undefined;
    }
  };

  const normalizeDriveUrl = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match?.[1]) {
      return `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
    return url;
  };

  const normalizeImageUrl = (url?: string) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('http')) return normalizeDriveUrl(trimmed);
    if (trimmed.startsWith('/')) {
      const base = import.meta.env.BASE_URL || '/';
      return new URL(trimmed.replace(/^\//, ''), `${window.location.origin}${base}`).toString();
    }
    return trimmed;
  };

  const normalizeVideoUrl = (url?: string) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed.includes('youtube.com/watch')) {
      const match = trimmed.match(/[?&]v=([^&]+)/);
      const id = match?.[1];
      return id ? `https://www.youtube.com/embed/${id}` : trimmed;
    }
    if (trimmed.includes('youtu.be/')) {
      const match = trimmed.match(/youtu\.be\/([^?]+)/);
      const id = match?.[1];
      return id ? `https://www.youtube.com/embed/${id}` : trimmed;
    }
    if (trimmed.includes('vimeo.com/')) {
      const match = trimmed.match(/vimeo\.com\/(\d+)/);
      const id = match?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : trimmed;
    }
    return trimmed;
  };

  const buildFromRows = useCallback((rows: SheetRow[]) => {
    const normalizeHeader = (key: string) =>
      key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const getNormalizedRow = (row: SheetRow) => {
      const normalized: Record<string, string | boolean | undefined> = {};
      Object.entries(row).forEach(([key, value]) => {
        normalized[normalizeHeader(key)] = value as string | boolean | undefined;
      });
      return normalized;
    };

    const cleanRows = rows
      .map((row) => ({
        ...row,
        _normalized: getNormalizedRow(row),
      }))
      .map((row) => ({
        id: row._normalized?.id?.toString().trim(),
        parentId: row._normalized?.parentid?.toString().trim(),
        label: row._normalized?.label?.toString().trim(),
        category: row._normalized?.category?.toString().trim(),
        color: row._normalized?.color?.toString().trim(),
        wikiUrl: row._normalized?.wikiurl?.toString().trim(),
        description: row._normalized?.description?.toString().trim(),
        details: row._normalized?.details?.toString().trim(),
        longDescription: row._normalized?.longdescription?.toString().trim(),
        externalLinks:
          row._normalized?.externallinksjsonarray?.toString().trim() ||
          row._normalized?.externallinks?.toString().trim(),
        images:
          row._normalized?.imagesjsonarray?.toString().trim() ||
          row._normalized?.images?.toString().trim(),
        video:
          row._normalized?.videojsonobject?.toString().trim() ||
          row._normalized?.video?.toString().trim(),
        hidden_by_default:
          row._normalized?.hiddenbydefault ?? row._normalized?.hidden,
      }))
      .filter((row) => row.id);

    const nodesFromSheet: Node[] = cleanRows.map((row) => ({
      id: row.id as string,
      type: 'method',
      position: { x: 0, y: 0 },
      hidden: parseHidden(row.hidden_by_default),
      data: {
        label: row.label || row.id,
        category: row.category || '',
        color: row.color || '#1f2937',
        wikiUrl: row.wikiUrl || '',
        description: row.description || '',
        details: row.details || '',
        longDescription: row.longDescription || '',
        externalLinks: parseJsonArray<{ label: string; url: string }>(row.externalLinks),
        images: parseJsonArray<{ src: string; alt?: string }>(row.images)?.map((img) => ({
          ...img,
          src: normalizeImageUrl(img.src) || img.src,
        })),
        video: (() => {
          const parsed = parseJsonObject<{ type?: 'youtube' | 'vimeo' | 'html5'; url?: string }>(row.video);
          if (!parsed?.url) return undefined;
          const normalizedUrl = normalizeVideoUrl(parsed.url);
          let type = parsed.type;
          if (!type) {
            if (normalizedUrl?.includes('youtube.com') || normalizedUrl?.includes('youtu.be')) type = 'youtube';
            else if (normalizedUrl?.includes('vimeo.com')) type = 'vimeo';
            else type = 'html5';
          }
          return {
            type: type as 'youtube' | 'vimeo' | 'html5',
            url: normalizedUrl || parsed.url,
          };
        })(),
      },
    }));

    const edgesFromSheet: Edge[] = cleanRows
      .filter((row) => row.parentId)
      .map((row) => ({
        id: `${row.parentId}->${row.id}`,
        source: row.parentId as string,
        target: row.id as string,
      }));

    const roots = cleanRows.filter((row) => !row.parentId).map((row) => row.id as string);

    return { nodesFromSheet, edgesFromSheet, roots };
  }, []);

  useEffect(() => {
    const loadSheet = async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const response = await fetch(SHEET_CSV_URL);
        if (!response.ok) {
          throw new Error(`Sheet load failed: ${response.status}`);
        }
        const csvText = await response.text();
        const parsed = Papa.parse<SheetRow>(csvText, {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors?.length) {
          throw new Error(parsed.errors[0].message);
        }
        const { nodesFromSheet, edgesFromSheet, roots } = buildFromRows(parsed.data || []);
        if (!nodesFromSheet.length) {
          throw new Error('No nodes found in sheet');
        }
        setBaseNodes(nodesFromSheet);
        setBaseEdges(edgesFromSheet);
        setRootIds(roots.length ? roots : nodesFromSheet.slice(0, 1).map((n) => n.id));
        setEdges(edgesFromSheet);
        setNodes(layoutNodes(nodesFromSheet, edgesFromSheet));
      } catch (error: any) {
        setDataError(error?.message || 'Failed to load sheet');
      } finally {
        setDataLoading(false);
      }
    };

    loadSheet();
  }, [buildFromRows, layoutNodes, setEdges, setNodes]);

  

  const baseNodeStyle = () => {
    return {
      boxShadow: '0 2px 12px 0 rgba(30,30,40,0.10)',
      transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease',
      boxHighlight: false,
    };
  };

  const manualActiveStyle = guidedActiveStyle;
  const manualInactiveStyle = guidedInactiveStyle;

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      setSelectedNode(node);
      if (mode !== 'manual') {
        return;
      }
      setManualHighlights((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        setNodes((nds) =>
          nds.map((n) => {
            const isActive = next.has(n.id);
            return {
              ...n,
              hidden: false,
              style: {
                ...baseNodeStyle(),
                ...(isActive ? guidedActiveStyle : guidedInactiveStyle),
              },
            };
          })
        );
        return next;
      });
    },
    [mode, setNodes, baseNodeStyle, manualActiveStyle, manualInactiveStyle]
  );

  const enterManualMode = () => {
    setMode('manual');
    setActivePath(null);
    setSelectedNode(null);
    setManualHighlights(new Set());
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        hidden: false,
        style: {
          ...baseNodeStyle(),
          ...guidedInactiveStyle,
        },
      }))
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        style: {
          stroke: paleColor,
          opacity: 0.25,
          strokeWidth: 1.5,
        },
      }))
    );
    setTimeout(() => {
      fitView({
        duration: 600,
        padding: 0.1,
      });
    }, 50);
  };

  const enterGuidedMode = () => {
    setMode('guided');
    setActivePath(null);
    setSelectedNode(null);
    setManualHighlights(new Set());
    setEdges(baseEdges);
    setNodes(layoutNodes(baseNodes, baseEdges));
    setTimeout(() => {
      fitView({
        duration: 600,
        padding: 0.2,
      });
    }, 50);
  };

  const showPath = (pathName: string) => {
    const pathNodes = paths[pathName as keyof typeof paths];
    setActivePath(pathName);
    setNodes((nds) => {
      const updated = nds.map((n) => {
        const isActive = pathNodes.includes(n.id);
        return {
          ...n,
          style: {
            ...baseNodeStyle(),
            ...(isActive ? guidedActiveStyle : guidedInactiveStyle),
          },
        };
      });
      return getLayoutedNodes(updated, edges);
    });
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => {
          const isActive = pathNodes.includes(n.id);
          return {
            ...n,
            hidden: false,
            style: {
              ...baseNodeStyle(),
              ...(isActive ? guidedActiveStyle : guidedInactiveStyle),
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
          hidden: rootIds.length ? !rootIds.includes(n.id) : false,
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
    <div style={{ width: '100vw', height: '100vh', background: '#f7f7fa' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodesDraggable={true}
        fitView
        snapToGrid={true}
        snapGrid={[30, 30]}
      >
        <Controls />
        {/* <Background color="#222" gap={16} /> */}

        <Panel position="top-left" style={{ 
          background: 'rgba(255,255,255,0.95)', 
          padding: '16px', 
          borderRadius: '8px',
          maxHeight: '90vh',
          overflowY: 'auto',
          width: '220px'
        }}>
          {(dataLoading || dataError) && (
            <div
              style={{
                marginBottom: '10px',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '11px',
                background: dataError ? '#fee2e2' : '#eef2ff',
                color: dataError ? '#991b1b' : '#3730a3',
              }}
            >
              {dataError ? `Sheet error: ${dataError}` : 'Loading sheet data…'}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={enterGuidedMode}
              style={{
                flex: 1,
                padding: '8px',
                background: mode === 'guided' ? '#3498db' : '#ecf0f1',
                color: mode === 'guided' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              Guided
            </button>
            <button
              onClick={enterManualMode}
              style={{
                flex: 1,
                padding: '8px',
                background: mode === 'manual' ? '#f59e0b' : '#ecf0f1',
                color: mode === 'manual' ? '#111827' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              Manual
            </button>
          </div>
          <button
            onClick={toggleLayout}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '10px',
              background: '#222',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
            }}
          >
            🔄 Switch Layout ({layoutDirections[layoutIndex].label})
          </button>
          {mode === 'manual' ? (
            <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.4 }}>
              Click any shape to toggle its highlight.
              <div style={{ marginTop: 8, fontSize: '11px', opacity: 0.75 }}>
                Highlighted: {manualHighlights.size}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
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
      selectedNodeData.video.type === 'html5' ? (
        <video
          controls
          src={selectedNodeData.video.url}
          style={{
            width: '100%',
            borderRadius: 8,
            marginTop: 16
          }}
        />
      ) : (
        <iframe
          src={selectedNodeData.video.url}
          style={{
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 8,
            marginTop: 16
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )
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