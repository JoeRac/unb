import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 240;
const nodeHeight = 80;

const CANVAS_BG = 'linear-gradient(135deg, #e8f0fe 0%, #f1f3f9 50%, #e3e9f7 100%)';
const NODE_SURFACE = 'rgba(255, 255, 255, 0.85)';
const NODE_SURFACE_MUTED = 'rgba(241, 245, 255, 0.75)';
const NODE_BORDER = 'rgba(26, 115, 232, 0.35)';
const HIGHLIGHT_COLOR = '#1a73e8';
const EDGE_COLOR = '#90a4c8';
const GLASS_SHADOW = '0 8px 32px rgba(31, 38, 135, 0.15), 0 4px 16px rgba(26, 115, 232, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
const GLASS_SHADOW_ACTIVE = '0 12px 40px rgba(26, 115, 232, 0.35), 0 6px 20px rgba(66, 133, 244, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.8)';

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
  const data = props.data as NodeData;
  const selected = props.selected as boolean;
  const background = props.style?.background ?? NODE_SURFACE;
  const color = props.style?.color ?? '#1f2937';
  const opacity = props.style?.opacity ?? 1;
  const border = props.style?.border ?? `1.5px solid ${NODE_BORDER}`;
  const boxShadow =
    props.style?.boxShadow ??
    (selected
      ? GLASS_SHADOW_ACTIVE
      : GLASS_SHADOW);
  const transition = props.style?.transition ?? 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <div
      style={{
        padding: props.style?.boxHighlight ? 18 : 10,
        fontSize: props.style?.boxHighlight ? 17 : 13,
        borderRadius: 18,
        background,
        color,
        opacity,
        border,
        minWidth: props.style?.boxHighlight ? 210 : 170,
        maxWidth: props.style?.boxHighlight ? 280 : 210,
        boxShadow,
        transition,
        cursor: 'pointer',
        position: 'relative',
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
      <div />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{data.label}</div>
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
  const [mode, setMode] = useState<'guided' | 'manual'>('guided');
  const [manualHighlights, setManualHighlights] = useState<Set<string>>(new Set());
  const [personalizedNodes, setPersonalizedNodes] = useState<Node[]>([]);
  const [baseNodes, setBaseNodes] = useState<Node[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [pathsList, setPathsList] = useState<PathRow[]>([]);
  const [pathsMap, setPathsMap] = useState<Record<string, string[]>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  const highlightColor = HIGHLIGHT_COLOR;
  const nodeBorder = NODE_BORDER;
  const guidedActiveStyle = {
    background: 'rgba(255, 255, 255, 0.95)',
    color: '#1a365d',
    opacity: 1,
    border: `2px solid ${highlightColor}`,
    boxShadow: GLASS_SHADOW_ACTIVE,
    borderRadius: 20,
    overflow: 'hidden',
    boxHighlight: true,
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  };
  const guidedInactiveStyle = {
    background: NODE_SURFACE_MUTED,
    color: '#475569',
    opacity: 0.9,
    border: `1.5px solid ${nodeBorder}`,
    boxShadow: GLASS_SHADOW,
    borderRadius: 20,
    overflow: 'hidden',
    boxHighlight: false,
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
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

  

  const baseNodeStyle = () => {
    return {
      boxShadow: GLASS_SHADOW,
      transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
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
          enforceRootHidden(nds).map((n) => {
            const isActive = next.has(n.id);
            return {
              ...n,
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
    setPersonalizedNodes([]);
    // Clear any existing personalized nodes
    setNodes((nds) =>
      enforceRootHidden(nds.filter((n) => !n.id.startsWith('personalized-'))).map((n) => ({
        ...n,
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
          stroke: EDGE_COLOR,
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
    setPersonalizedNodes([]);
    setEdges(baseEdges);
    setNodes(enforceRootHidden(layoutNodes(baseNodes, baseEdges)));
    setTimeout(() => {
      fitView({
        duration: 600,
        padding: 0.2,
      });
    }, 50);
  };

  const personalizeSelection = () => {
    if (manualHighlights.size === 0) return;

    // Get the rightmost position of current visible nodes
    const visibleNodes = nodes.filter((n) => !n.hidden && !n.id.startsWith('personalized-'));
    const maxX = Math.max(...visibleNodes.map((n) => n.position.x + nodeWidth), 0);
    const startX = maxX + 300; // Gap between original diagram and personalized section
    const startY = 150; // Vertical position for the horizontal row

    // Get selected nodes data
    const selectedNodeIds = Array.from(manualHighlights);
    const selectedNodesData = nodes.filter((n) => selectedNodeIds.includes(n.id));

    // Create duplicated nodes with unique IDs - create fresh nodes with correct positions
    const duplicatedNodes: Node[] = selectedNodesData.map((n, index) => {
      const nodeData = n.data as NodeData;
      const xPos = startX + (index * (nodeWidth + 60));
      const yPos = startY;
      
      return {
        id: `personalized-${n.id}`,
        type: 'methodNode',
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
        style: {
          background: 'rgba(255, 255, 255, 0.95)',
          border: '2px solid #10b981',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.25), 0 4px 16px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          borderRadius: 20,
        },
        draggable: true,
        selectable: true,
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

    // Fit view to show both original and personalized after a brief delay
    setTimeout(() => {
      fitView({
        duration: 800,
        padding: 0.1,
      });
    }, 100);
  };

  const clearPersonalized = () => {
    // Remove personalized nodes
    setNodes((nds) => nds.filter((n) => !n.id.startsWith('personalized-')));
    setPersonalizedNodes([]);
    // Clear the manual highlights that were personalized
    setManualHighlights(new Set());
    // Reset all remaining nodes to inactive style
    setTimeout(() => {
      setNodes((nds) =>
        enforceRootHidden(nds).map((n) => ({
          ...n,
          style: {
            ...baseNodeStyle(),
            ...guidedInactiveStyle,
          },
        }))
      );
      fitView({ duration: 400, padding: 0.15 });
    }, 50);
  };

  const showPath = (pathName: string) => {
    const pathNodes = pathsMap[pathName];
    if (!pathNodes?.length) {
      return;
    }
    setActivePath(pathName);
    setNodes((nds) => {
      const updated = enforceRootHidden(nds).map((n) => {
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
        enforceRootHidden(nds).map((n) => {
          const isActive = pathNodes.includes(n.id);
          return {
            ...n,
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
            stroke: isActive ? highlightColor : EDGE_COLOR,
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
      enforceRootHidden(nds).map((n) => ({
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
        enforceRootHidden(nds).map((n) => ({
          ...n,
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
      enforceRootHidden(nds).map((n) => ({
        ...n,
        hidden: rootIds.includes(n.id),
        style: {
          ...n.style,
          opacity: 0,
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        },
      }))
    );

    setTimeout(() => {
      setNodes((nds) =>
        enforceRootHidden(nds).map((n, index) => ({
          ...n,
          hidden: rootIds.includes(n.id),
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
    <div style={{ width: '100vw', height: '100vh', background: CANVAS_BG }}>
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
          background: 'rgba(255,255,255,0.92)', 
          padding: '16px', 
          borderRadius: '14px',
          maxHeight: '90vh',
          overflowY: 'auto',
          width: '230px',
          boxShadow: '0 18px 40px rgba(15,23,42,0.14)',
          border: '1px solid rgba(26,115,232,0.18)'
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
              <button
                onClick={personalizeSelection}
                disabled={manualHighlights.size === 0}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '12px',
                  background: manualHighlights.size > 0 
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                    : '#e5e7eb',
                  color: manualHighlights.size > 0 ? 'white' : '#9ca3af',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: manualHighlights.size > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease',
                  boxShadow: manualHighlights.size > 0 
                    ? '0 4px 14px rgba(16, 185, 129, 0.35)' 
                    : 'none',
                }}
              >
                ✨ Personalize ({manualHighlights.size})
              </button>
              {personalizedNodes.length > 0 && (
                <button
                  onClick={clearPersonalized}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '8px',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                  }}
                >
                  🗑️ Clear Personalized ({personalizedNodes.length})
                </button>
              )}
            </div>
          ) : (
            <>
              {pathsList.length > 0 && (
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#333' }}>📊 Explore Paths</h3>
              )}
              
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

              {pathsList.map((path) => (
                <button
                  key={path.name}
                  onClick={() => showPath(path.name)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginBottom: '6px',
                    background: activePath === path.name ? '#3498db' : 'white',
                    color: activePath === path.name ? 'white' : '#333',
                    border: activePath === path.name ? 'none' : '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textAlign: 'left',
                    transition: 'all 0.3s ease',
                    fontWeight: activePath === path.name ? 'bold' : 'normal',
                    transform: activePath === path.name ? 'translateX(4px)' : 'translateX(0)'
                  }}
                  onMouseEnter={(e) => {
                    if (activePath !== path.name) {
                      e.currentTarget.style.background = '#e8f4f8';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activePath !== path.name) {
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }
                  }}
                >
                  {path.name}
                </button>
              ))}

              {/* Personalize section for Guided mode */}
              {activePath && activePath !== 'All Nodes' && pathsMap[activePath]?.length > 0 && (
                <>
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                      Path has {pathsMap[activePath]?.length || 0} nodes
                    </div>
                    <button
                      onClick={() => {
                        // Set manualHighlights to the current path nodes, then personalize
                        const pathNodeIds = pathsMap[activePath] || [];
                        setManualHighlights(new Set(pathNodeIds));
                        // Small delay to ensure state is set
                        setTimeout(() => {
                          personalizeSelection();
                        }, 50);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                      }}
                    >
                      ✨ Personalize Path
                    </button>
                  </div>
                </>
              )}

              {personalizedNodes.length > 0 && (
                <button
                  onClick={clearPersonalized}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '12px',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                  }}
                >
                  🗑️ Clear Personalized ({personalizedNodes.length})
                </button>
              )}
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