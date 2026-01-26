import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 240;
const nodeHeight = 80;

const CANVAS_BG = 'linear-gradient(135deg, #e8f0fe 0%, #f1f3f9 50%, #e3e9f7 100%)';
const NODE_SURFACE_MUTED = 'rgba(241, 245, 255, 0.75)';
const NODE_BORDER = 'rgba(26, 115, 232, 0.35)';
const HIGHLIGHT_COLOR = '#1a73e8';
const EDGE_COLOR = '#90a4c8';
const GLASS_SHADOW = '0 4px 12px rgba(31, 38, 135, 0.08), 0 2px 6px rgba(26, 115, 232, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)';

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
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Papa from 'papaparse';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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
  parentIds?: string;
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

const SHEET_TSV_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/export?format=tsv';
const PATHS_GVIZ_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/gviz/tq?sheet=paths&tqx=out:json';

function MethodNode(props: any) {
  const data = props.data as NodeData & { isHighlighted?: boolean };
  const isHighlighted = data.isHighlighted === true;
  
  // Lighter, refined glass-like blue gradient when highlighted
  const background = isHighlighted 
    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 155, 255, 0.18) 100%)'
    : NODE_SURFACE_MUTED;
  const color = isHighlighted ? '#1e40af' : '#475569';
  const border = isHighlighted ? `2px solid rgba(59, 130, 246, 0.5)` : `1.5px solid ${NODE_BORDER}`;
  const boxShadow = isHighlighted ? '0 4px 16px rgba(59, 130, 246, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)' : GLASS_SHADOW;

  return (
    <div
      style={{
        padding: 10,
        fontSize: 13,
        borderRadius: 16,
        background,
        color,
        border,
        minWidth: 170,
        maxWidth: 210,
        boxShadow,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555', opacity: 0, width: 0, height: 0 }}
        isConnectable={false}
      />
      <div />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, textAlign: 'center' }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 10, opacity: 0.8, fontStyle: 'italic', textAlign: 'center' }}>
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

// Personalized node - larger, no handles
function PersonalizedNode(props: any) {
  const data = props.data as NodeData;

  return (
    <div
      style={{
        padding: 20,
        fontSize: 16,
        borderRadius: 22,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 253, 244, 0.95) 100%)',
        color: '#1f2937',
        border: '2px solid #10b981',
        width: 340,
        minHeight: 100,
        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        cursor: 'pointer',
        position: 'relative',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 12, opacity: 0.8, fontStyle: 'italic', marginBottom: 6, textAlign: 'center' }}>
          {data.category}
        </div>
      )}
      {data.description && (
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.4 }}>
          {data.description}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { method: MethodNode, personalizedNode: PersonalizedNode };

type PathRow = {
  name: string;
  nodeIds: string[];
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    // Toggle layout direction
    const toggleLayout = () => {
      const nextIndex = (layoutIndex + 1) % layoutDirections.length;
      setLayoutIndex(nextIndex);
      setNodes((nds) => getLayoutedNodes(nds, edges, layoutDirections[nextIndex].value as 'TB'));
    };
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [manualHighlights, setManualHighlights] = useState<Set<string>>(new Set());
  const [personalizedNodes, setPersonalizedNodes] = useState<Node[]>([]);
  const [, setBaseNodes] = useState<Node[]>([]);
  const [, setBaseEdges] = useState<Edge[]>([]);
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [pathsList, setPathsList] = useState<PathRow[]>([]);
  const [pathsMap, setPathsMap] = useState<Record<string, string[]>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);

  const highlightColor = HIGHLIGHT_COLOR;

  const exportToPDF = async () => {
    if (!flowRef.current) return;
    
    try {
      const canvas = await html2canvas(flowRef.current, {
        backgroundColor: '#f8fafc',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('diagram-export.pdf');
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  const layoutNodes = useCallback(
    (nodesToLayout: Node[], edgesToLayout: Edge[]) =>
      getLayoutedNodes(nodesToLayout, edgesToLayout, layoutDirections[layoutIndex].value as 'TB'),
    [layoutIndex, layoutDirections]
  );

  const enforceRootHidden = useCallback(
    (nds: Node[], explicitRoots?: string[]) => {
      const roots = explicitRoots || rootIds;
      return nds.map((n) => ({
        ...n,
        hidden: roots.includes(n.id) ? true : n.hidden,
      }));
    },
    [rootIds]
  );
  void enforceRootHidden;

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
    const parseParentIds = (value?: string, list?: string[]) => {
      if (list?.length) {
        return list.map((v) => v.trim()).filter(Boolean);
      }
      const raw = (value || '').trim();
      if (!raw) return [];
      if (raw.startsWith('[') && raw.endsWith(']')) {
        const parsed = parseJsonArray<string>(raw);
        if (parsed?.length) {
          return parsed.map((v) => v.trim()).filter(Boolean);
        }
      }
      if (raw.includes(',') || raw.includes('|') || raw.includes(';')) {
        return raw
          .split(/,|\||;/)
          .map((v) => v.trim())
          .filter(Boolean);
      }
      if (raw.includes('-') && /^[0-9\s-]+$/.test(raw)) {
        return raw
          .split('-')
          .map((v) => v.trim())
          .filter(Boolean);
      }
      if (/\s/.test(raw)) {
        return raw
          .split(/\s+/)
          .map((v) => v.trim())
          .filter(Boolean);
      }
      return [raw];
    };

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
        parentIds:
          row._normalized?.parentidsjsonarray?.toString().trim() ||
          row._normalized?.parentids?.toString().trim(),
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
      .flatMap((row) => {
        const parentIdsList = parseJsonArray<string>(row.parentIds);
        const parents = parseParentIds(row.parentId, parentIdsList);
        if (!parents.length) return [];
        return parents.map((parentId) => ({
          id: `${parentId}->${row.id}`,
          source: parentId,
          target: row.id as string,
        }));
      });

    const roots = cleanRows
      .filter((row) => {
        const parentIdsList = parseJsonArray<string>(row.parentIds);
        return parseParentIds(row.parentId, parentIdsList).length === 0;
      })
      .map((row) => row.id as string);

    return { nodesFromSheet, edgesFromSheet, roots };
  }, []);

  useEffect(() => {
    const loadSheet = async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const response = await fetch(SHEET_TSV_URL);
        if (!response.ok) {
          throw new Error(`Sheet load failed: ${response.status}`);
        }
        const csvText = await response.text();
        const parsed = Papa.parse<SheetRow>(csvText, {
          header: true,
          skipEmptyLines: true,
          delimiter: '\t',
        });
        if (parsed.errors?.length) {
          throw new Error(parsed.errors[0].message);
        }
        const { nodesFromSheet, edgesFromSheet, roots } = buildFromRows(parsed.data || []);
        if (!nodesFromSheet.length) {
          throw new Error('No nodes found in sheet');
        }
        const effectiveRoots = roots.length ? roots : nodesFromSheet.slice(0, 1).map((n) => n.id);
        setBaseNodes(nodesFromSheet);
        setBaseEdges(edgesFromSheet);
        setRootIds(effectiveRoots);
        setEdges(edgesFromSheet);
        setNodes(enforceRootHidden(layoutNodes(nodesFromSheet, edgesFromSheet), effectiveRoots));
        setTimeout(() => {
          fitView({
            duration: 600,
            padding: 0.2,
          });
        }, 50);
      } catch (error: any) {
        setDataError(error?.message || 'Failed to load sheet');
      } finally {
        setDataLoading(false);
      }
    };

    loadSheet();
  }, [buildFromRows, layoutNodes, setEdges, setNodes]);

  useEffect(() => {
    const loadPaths = async () => {
      try {
        const response = await fetch(PATHS_GVIZ_URL);
        if (!response.ok) {
          setPathsList([]);
          setPathsMap({});
          return;
        }
        const rawText = await response.text();
        const jsonMatch = rawText.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
        const jsonText = jsonMatch?.[1];
        if (!jsonText) {
          setPathsList([]);
          setPathsMap({});
          return;
        }
        const parsedJson = JSON.parse(jsonText);
        const rows: any[] = parsedJson?.table?.rows || [];
        const values: Array<[string | null | undefined, string | null | undefined]> = rows.map((row: any) => [row.c?.[0]?.v, row.c?.[1]?.v]);
        const isHeaderRow = (row: Array<string | null | undefined>) => {
          const first = (row?.[0] || '').toString().toLowerCase();
          const second = (row?.[1] || '').toString().toLowerCase();
          return (
            (first.includes('name') || first.includes('button') || first.includes('label')) &&
            (second.includes('id') || second.includes('node'))
          );
        };
        const filtered = values.filter((row: Array<string | null | undefined>) => row && row.length >= 2 && row[0]);
        const effectiveRows = filtered.length && isHeaderRow(filtered[0]) ? filtered.slice(1) : filtered;
        const list: PathRow[] = effectiveRows
          .map((row: Array<string | null | undefined>) => {
            const name = (row[0] || '').toString().trim();
            const nodeIds = (row[1] || '')
              .toString()
              .split(',')
              .map((v: string) => v.trim())
              .filter(Boolean);
            return { name, nodeIds };
          })
          .filter((row) => row.name && row.nodeIds.length);
        const map: Record<string, string[]> = {};
        list.forEach((row) => {
          map[row.name] = row.nodeIds;
        });
        setPathsList(list);
        setPathsMap(map);
      } catch {
        setPathsList([]);
        setPathsMap({});
      }
    };

    loadPaths();
  }, []);

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      setSelectedNode(node);
      // Skip personalized nodes from toggling
      if (node.id.startsWith('personalized-')) return;
      
      setManualHighlights((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        // Update visual state to match manualHighlights
        setNodes((nds) =>
          enforceRootHidden(nds).map((n) => {
            if (n.id.startsWith('personalized-')) return n;
            return {
              ...n,
              data: {
                ...n.data,
                isHighlighted: next.has(n.id),
              },
            };
          })
        );
        return next;
      });
    },
    [setNodes, enforceRootHidden]
  );

  const personalizeSelection = () => {
    if (manualHighlights.size === 0) return;

    // Get the rightmost position of current visible nodes
    const visibleNodes = nodes.filter((n) => !n.hidden && !n.id.startsWith('personalized-'));
    const maxX = Math.max(...visibleNodes.map((n) => n.position.x + nodeWidth), 0);
    const startX = maxX + 200; // Gap between original diagram and personalized section
    const startY = 50; // Starting vertical position (higher up)
    const horizontalStep = 180; // Horizontal step for diagonal
    const verticalStep = 140; // Vertical step for descending staircase

    // Get selected nodes data
    const selectedNodeIds = Array.from(manualHighlights);
    const selectedNodesData = nodes.filter((n) => selectedNodeIds.includes(n.id));

    // Create duplicated nodes with unique IDs - descending diagonal staircase
    const duplicatedNodes: Node[] = selectedNodesData.map((n, index) => {
      const nodeData = n.data as NodeData;
      const xPos = startX + (index * horizontalStep);
      const yPos = startY + (index * verticalStep); // Descending: each node lower than previous
      
      return {
        id: `personalized-${n.id}`,
        type: 'personalizedNode',
        position: { x: xPos, y: yPos },
        data: {
          label: nodeData.label,
          color: nodeData.color,
          category: nodeData.category,
          description: nodeData.description,
          details: nodeData.details,
          longDescription: nodeData.longDescription,
          wikiUrl: nodeData.wikiUrl,
          externalLinks: nodeData.externalLinks,
          images: nodeData.images,
          video: nodeData.video,
        },
        draggable: true,
        selectable: false,
        hidden: false,
      };
    });

    // Set all nodes at once, including the new personalized ones
    setNodes((nds) => {
      // Filter out any existing personalized versions of the same nodes
      const existingPersonalizedIds = duplicatedNodes.map(dn => dn.id);
      const filteredNodes = nds.filter(n => !existingPersonalizedIds.includes(n.id));
      return [...filteredNodes, ...duplicatedNodes];
    });
    setPersonalizedNodes((prev) => [...prev, ...duplicatedNodes]);

    // Fit view to the personalized nodes only, with proper centering
    setTimeout(() => {
      fitView({
        duration: 800,
        padding: 0.3, // More padding to center properly
        nodes: duplicatedNodes.map(n => ({ id: n.id })), // Focus on personalized nodes
      });
    }, 100);
  };

  const clearPersonalized = () => {
    // Remove personalized nodes but keep highlights on original nodes
    setNodes((nds) => nds.filter((n) => !n.id.startsWith('personalized-')));
    setPersonalizedNodes([]);
    // Don't clear manualHighlights - keep the original boxes highlighted
    // Fit view back to the diagram
    setTimeout(() => {
      fitView({ duration: 400, padding: 0.15 });
    }, 50);
  };

  const showPath = (pathName: string) => {
    const pathNodes = pathsMap[pathName];
    if (!pathNodes?.length) {
      return;
    }
    setActivePath(pathName);
    // Reset to only the new path's nodes (don't accumulate between path buttons)
    setManualHighlights(new Set(pathNodes));
    setNodes((nds) => {
      const updated = enforceRootHidden(nds).map((n) => {
        const isActive = pathNodes.includes(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            isHighlighted: isActive, // Reset: only show this path's nodes
          },
        };
      });
      return getLayoutedNodes(updated, edges);
    });
    setTimeout(() => {
      fitView({ 
        duration: 500,
        padding: 0.2,
      });
    }, 100);
    // Reset all edges: only highlight this path's edges
    setEdges((eds: Edge[]) =>
      eds.map((e: Edge) => {
        const isActive = pathNodes.includes(e.source) && pathNodes.includes(e.target);
        return {
          ...e,
          style: {
            stroke: isActive ? highlightColor : EDGE_COLOR,
            opacity: isActive ? 1 : 0.25,
            strokeWidth: isActive ? 2.5 : 1.5,
          },
        };
      })
    );
  };

  const resetView = () => {
    setActivePath(null);
    setManualHighlights(new Set());
    
    setNodes((nds) =>
      enforceRootHidden(nds).map((n) => ({
        ...n,
        data: {
          ...n.data,
          isHighlighted: false,
        },
      }))
    );

    // Reset edge styles
    setEdges((eds: Edge[]) =>
      eds.map((e: Edge) => ({
        ...e,
        style: {
          stroke: EDGE_COLOR,
          opacity: 0.5,
          strokeWidth: 1.5,
        },
      }))
    );

    setTimeout(() => {
      fitView({ 
        duration: 500,
        padding: 0.2,
      });
    }, 50);
  };

  const selectedNodeData = selectedNode ? (selectedNode.data as NodeData) : null;

  return (
    <div ref={flowRef} style={{ width: '100vw', height: '100vh', background: CANVAS_BG }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodesDraggable={true}
        fitView
        snapToGrid={false}
      >
        <Controls />
        {/* <Background color="#222" gap={16} /> */}

        <Panel position="top-left" style={{ 
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.95) 100%)', 
          padding: '18px', 
          borderRadius: '16px',
          maxHeight: '90vh',
          overflowY: 'auto',
          width: '220px',
          boxShadow: '0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(59,130,246,0.04)',
          border: '1px solid rgba(226,232,240,0.8)',
          backdropFilter: 'blur(12px)',
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
          
          <button
            onClick={toggleLayout}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '8px',
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            ↻ Layout: {layoutDirections[layoutIndex].label}
          </button>

          <button
            onClick={exportToPDF}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '12px',
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            ↓ Export PDF
          </button>

          {/* Selection count - subtle */}
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px', textAlign: 'center' }}>
            {manualHighlights.size} selected
          </div>

          {/* Personalize button - refined */}
          <button
            onClick={personalizeSelection}
            disabled={manualHighlights.size === 0}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '12px',
              background: manualHighlights.size > 0 
                ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' 
                : '#f8fafc',
              color: manualHighlights.size > 0 ? '#047857' : '#94a3b8',
              border: manualHighlights.size > 0 
                ? '1px solid rgba(16, 185, 129, 0.3)' 
                : '1px solid #e2e8f0',
              borderRadius: '10px',
              cursor: manualHighlights.size > 0 ? 'pointer' : 'not-allowed',
              fontSize: '11px',
              fontWeight: '600',
              boxShadow: manualHighlights.size > 0 
                ? '0 2px 8px rgba(16, 185, 129, 0.08)' 
                : 'none',
            }}
          >
            ✦ Personalize ({manualHighlights.size})
          </button>

          {personalizedNodes.length > 0 && (
            <button
              onClick={clearPersonalized}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '12px',
                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                color: '#b91c1c',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: '600',
              }}
            >
              ✕ Clear Personalized ({personalizedNodes.length})
            </button>
          )}

          {/* Paths section */}
          {pathsList.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '6px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#475569', fontWeight: '600', letterSpacing: '0.02em' }}>Explore Paths</h3>
              </div>
              
              <button
                onClick={resetView}
                style={{
                  width: '100%',
                  padding: '9px',
                  marginBottom: '10px',
                  background: activePath === null 
                    ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  color: activePath === null ? '#1d4ed8' : '#64748b',
                  border: activePath === null 
                    ? '1px solid rgba(59, 130, 246, 0.3)' 
                    : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                }}
              >
                ↺ Reset View
              </button>

              {pathsList.map((path) => (
                <button
                  key={path.name}
                  onClick={() => showPath(path.name)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    marginBottom: '5px',
                    background: activePath === path.name 
                      ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                      : 'rgba(255,255,255,0.6)',
                    color: activePath === path.name ? '#1d4ed8' : '#475569',
                    border: activePath === path.name 
                      ? '1px solid rgba(59, 130, 246, 0.3)' 
                      : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textAlign: 'left',
                    fontWeight: activePath === path.name ? '600' : '500',
                  }}
                >
                  {path.name}
                </button>
              ))}
            </>
          )}
        </Panel>

        {selectedNode && selectedNodeData && (
  <Panel
    position="top-right"
    style={{
      background: 'rgba(255,255,255,0.96)',
      padding: '20px',
      borderRadius: '14px',
      width: '360px',
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow: '0 22px 48px rgba(15,23,42,0.2)',
      border: '1px solid rgba(26,115,232,0.22)',
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