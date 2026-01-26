import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 240;
const nodeHeight = 80;

// Premium glass theme - clean whites and subtle accents
const CANVAS_BG = 'linear-gradient(145deg, #ffffff 0%, #fafcfe 50%, #f8fafc 100%)';
const NODE_SURFACE = 'rgba(248, 250, 252, 0.97)';
const NODE_BORDER = 'rgba(203, 213, 225, 0.5)';
const HIGHLIGHT_COLOR = '#3b82f6';
const EDGE_COLOR = '#cbd5e1';
const GLASS_SHADOW = '0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)';
const GLASS_SHADOW_SELECTED = '0 2px 8px rgba(59, 130, 246, 0.18), 0 4px 20px rgba(59, 130, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1)';

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
import { useCallback, useEffect, useState, useRef } from 'react';
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
const PATHS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/gviz/tq?sheet=paths&tqx=out:csv';
const NODE_PATH_GVIZ_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/gviz/tq?sheet=node-path&tqx=out:json';

function MethodNode(props: any) {
  const data = props.data as NodeData & { isHighlighted?: boolean; onInfoClick?: (nodeId: string) => void };
  const isHighlighted = data.isHighlighted === true;
  
  // Premium glass styling
  const background = isHighlighted 
    ? 'linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.95) 100%)'
    : NODE_SURFACE;
  const textColor = isHighlighted ? '#1e40af' : '#334155';
  const borderStyle = isHighlighted ? '1.5px solid rgba(59, 130, 246, 0.4)' : `1px solid ${NODE_BORDER}`;
  const shadow = isHighlighted ? GLASS_SHADOW_SELECTED : GLASS_SHADOW;

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection
    if (data.onInfoClick) {
      data.onInfoClick(props.id);
    }
  };

  return (
    <div
      style={{
        padding: '12px 14px',
        fontSize: 13,
        borderRadius: 14,
        background,
        color: textColor,
        border: borderStyle,
        minWidth: 160,
        maxWidth: 200,
        boxShadow: shadow,
        cursor: 'pointer',
        position: 'relative',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555', opacity: 0, width: 0, height: 0 }}
        isConnectable={false}
      />
      {/* Info button */}
      <button
        onClick={handleInfoClick}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(100, 116, 139, 0.08)',
          color: '#64748b',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)';
          e.currentTarget.style.color = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(100, 116, 139, 0.08)';
          e.currentTarget.style.color = '#64748b';
        }}
      >
        i
      </button>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3, textAlign: 'center', paddingRight: 16 }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 10, opacity: 0.6, fontStyle: 'italic', textAlign: 'center' }}>
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

// Personalized node - larger, premium styling with info button and text input
function PersonalizedNode(props: any) {
  const data = props.data as NodeData & { onInfoClick?: (nodeId: string) => void; userNotes?: string; onNotesChange?: (nodeId: string, notes: string) => void };

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onInfoClick) {
      data.onInfoClick(props.id);
    }
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (data.onNotesChange) {
      data.onNotesChange(props.id, e.target.value);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      {/* Main node card */}
      <div
        style={{
          padding: '20px 22px',
          fontSize: 16,
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 253, 244, 0.96) 100%)',
          color: '#1f2937',
          border: '1.5px solid rgba(16, 185, 129, 0.35)',
          width: 280,
          minHeight: 90,
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
          cursor: 'pointer',
          position: 'relative',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Info button */}
        <button
          onClick={handleInfoClick}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(16, 185, 129, 0.08)',
            color: '#10b981',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)';
          }}
        >
          i
        </button>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, textAlign: 'center', paddingRight: 20 }}>{data.label}</div>
        {data.category && (
          <div style={{ fontSize: 11, opacity: 0.6, fontStyle: 'italic', marginBottom: 6, textAlign: 'center' }}>
            {data.category}
          </div>
        )}
        {data.description && (
          <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5, textAlign: 'center' }}>
            {data.description}
          </div>
        )}
      </div>

      {/* Text input beside the node */}
      <textarea
        placeholder="Add your notes..."
        value={data.userNotes || ''}
        onChange={handleNotesChange}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 240,
          minHeight: 90,
          padding: '12px 14px',
          fontSize: 13,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#334155',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.5,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
        }}
      />
    </div>
  );
}

const nodeTypes = { method: MethodNode, personalizedNode: PersonalizedNode };

type PathRow = {
  id: string;
  name: string;
  nodeIds: string[];
};

function DiagramContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [manualHighlights, setManualHighlights] = useState<Set<string>>(new Set());
  const [personalizedNodes, setPersonalizedNodes] = useState<Node[]>([]);
  const [, setBaseNodes] = useState<Node[]>([]);
  const [, setBaseEdges] = useState<Edge[]>([]);
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [pathsList, setPathsList] = useState<PathRow[]>([]);
  const [pathsMap, setPathsMap] = useState<Record<string, string[]>>({});
  const [nodePathMap, setNodePathMap] = useState<Record<string, Record<string, string>>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [pathName, setPathName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [sidebarNodeContent, setSidebarNodeContent] = useState<Record<string, string>>({});
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activePathIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    activePathIdRef.current = activePathId;
  }, [activePathId]);

  // Google Apps Script Web App URL - you need to deploy your own script and paste the URL here
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxB-ZqUET5wE2NSvq47fisCRYE3r8SpaMHbPJ1zEBdTiUX71QhnM75A2yDY-vBCNHaZ/exec';

  const highlightColor = HIGHLIGHT_COLOR;

  // Use a ref to store the info click handler to avoid re-render loops
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;

  // Handler for info button click - shows the popup (uses ref to avoid dependency on nodes)
  const handleInfoClick = useCallback((nodeId: string) => {
    const currentNodes = nodesRef.current;
    const node = currentNodes.find(n => n.id === nodeId || n.id === `personalized-${nodeId}` || nodeId === `personalized-${n.id}`);
    if (node) {
      setSelectedNode(node);
    } else {
      // Try to find by stripping personalized- prefix
      const cleanId = nodeId.replace('personalized-', '');
      const foundNode = currentNodes.find(n => n.id === cleanId || n.id === nodeId);
      if (foundNode) {
        setSelectedNode(foundNode);
      }
    }
  }, []); // Empty deps - uses ref instead

  // Handler for notes change in personalized nodes with debounced auto-save
  const handleNotesChange = useCallback((nodeId: string, notes: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              userNotes: notes,
            },
          };
        }
        return n;
      })
    );
    // Also update personalizedNodes state
    setPersonalizedNodes((prev) =>
      prev.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              userNotes: notes,
            },
          };
        }
        return n;
      })
    );

    // Auto-save with debounce (only if a path is loaded)
    const currentPathId = activePathIdRef.current;
    if (currentPathId) {
      // Clear existing timer for this node
      if (debounceTimerRef.current[nodeId]) {
        clearTimeout(debounceTimerRef.current[nodeId]);
      }
      
      // Set new debounced save
      debounceTimerRef.current[nodeId] = setTimeout(async () => {
        // Extract the original node ID (remove personalized- prefix)
        const originalNodeId = nodeId.replace('personalized-', '');
        try {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'saveNodeContent',
              pathId: currentPathId,
              nodeId: originalNodeId,
              content: notes,
            }),
          });
        } catch (error) {
          console.error('Error saving node content:', error);
        }
      }, 1000); // 1 second debounce
    }
  }, [setNodes, GOOGLE_SCRIPT_URL]);

  // Generate unique path ID: name-YYYYMMDDHHmmss
  const generatePathId = (name: string) => {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    return `${name.replace(/\s+/g, '-')}-${timestamp}`;
  };

  // Save path to Google Sheets via Google Apps Script
  const savePath = async () => {
    if (!pathName.trim()) {
      alert('Please enter a path name');
      return;
    }
    if (manualHighlights.size === 0) {
      alert('No nodes selected');
      return;
    }

    const pathId = generatePathId(pathName.trim());
    const nodeIds = Array.from(manualHighlights).join(', ');
    setSaveStatus('saving');

    try {
      // Save the path
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script requires no-cors
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'savePath',
          pathId: pathId,
          pathName: pathName.trim(),
          nodeIds: nodeIds,
        }),
      });

      // If we have an active path with node content, copy that content to the new path
      // This handles the "copy path" scenario when user modifies the name
      if (activePathId && nodePathMap[activePathId]) {
        const sourceContent = nodePathMap[activePathId];
        
        // Build a batch of all node content to copy in a single request
        const nodeContentBatch: Array<{nodeId: string; content: string}> = [];
        
        // Collect content from source path and sidebar edits
        for (const nodeId of manualHighlights) {
          const content = sidebarNodeContent[nodeId] ?? sourceContent[nodeId];
          if (content) {
            nodeContentBatch.push({ nodeId, content });
          }
        }
        
        // Send all content in a single batch request
        if (nodeContentBatch.length > 0) {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'batchSaveNodeContent',
              pathId: pathId,
              nodeContents: nodeContentBatch,
            }),
          });
          
          // Update local nodePathMap with copied content
          const copiedContent: Record<string, string> = {};
          nodeContentBatch.forEach(({ nodeId, content }) => {
            copiedContent[nodeId] = content;
          });
          setNodePathMap(prev => ({
            ...prev,
            [pathId]: copiedContent,
          }));
        }
      }

      // With no-cors, we can't read the response, so we assume success
      setSaveStatus('success');
      
      // Add the new path to local state immediately so it appears in the list
      const nodeIdsArray = Array.from(manualHighlights);
      const newPathRow: PathRow = {
        id: pathId,
        name: pathName.trim(),
        nodeIds: nodeIdsArray,
      };
      setPathsList(prev => [...prev, newPathRow]);
      setPathsMap(prev => ({
        ...prev,
        [pathName.trim()]: nodeIdsArray,
      }));
      
      // Update the active path to the newly saved one
      setActivePath(pathName.trim());
      setActivePathId(pathId);
      
      // Reset status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving path:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Delete path from Google Sheets
  const deletePath = async () => {
    if (!activePath) return;
    
    // Find the path ID for the active path
    const pathRow = pathsList.find(p => p.name === activePath);
    if (!pathRow) {
      alert('Path not found');
      return;
    }

    if (!confirm(`Are you sure you want to delete the path "${activePath}"?`)) {
      return;
    }

    // Use id if available, otherwise use name as identifier
    const pathIdToDelete = pathRow.id || pathRow.name;

    setSaveStatus('saving');

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deletePath',
          pathId: pathIdToDelete,
          pathName: pathRow.name, // Also send name for fallback matching
        }),
      });

      setSaveStatus('success');
      setActivePath(null);
      setActivePathId(null);
      setSidebarNodeContent({});
      setManualHighlights(new Set());
      
      // Also remove from local state immediately
      setPathsList(prev => prev.filter(p => p.name !== activePath));
      setPathsMap(prev => {
        const newMap = { ...prev };
        delete newMap[activePath];
        return newMap;
      });
      
      // Clear highlighting
      setNodes((nds) =>
        enforceRootHidden(nds).map((n) => ({
          ...n,
          data: { ...n.data, isHighlighted: false },
        }))
      );
      
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error deleting path:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const exportToPDF = async () => {
    if (!flowRef.current) return;
    
    try {
      // Find the viewport element for better capture
      const viewport = flowRef.current.querySelector('.react-flow__viewport') as HTMLElement;
      const targetElement = viewport || flowRef.current;
      
      const canvas = await html2canvas(targetElement, {
        backgroundColor: '#fafbfc',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Ensure styles are preserved in the clone
          const clonedNodes = clonedDoc.querySelectorAll('.react-flow__node');
          clonedNodes.forEach((node) => {
            const el = node as HTMLElement;
            el.style.opacity = '1';
          });
        },
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
      getLayoutedNodes(nodesToLayout, edgesToLayout, 'TB'),
    []
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
        // Add onInfoClick to each node's data
        const nodesWithCallback = nodesFromSheet.map(n => ({
          ...n,
          data: {
            ...n.data,
            onInfoClick: handleInfoClick,
          },
        }));
        setNodes(enforceRootHidden(layoutNodes(nodesWithCallback, edgesFromSheet), effectiveRoots));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  useEffect(() => {
    const loadPaths = async () => {
      try {
        const response = await fetch(PATHS_CSV_URL);
        if (!response.ok) {
          setPathsList([]);
          setPathsMap({});
          return;
        }
        const text = await response.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        const rows = parsed.data as Array<Record<string, string>>;
        
        const list: PathRow[] = rows
          .map((row) => {
            // Handle various column name possibilities
            const id = (row['id'] || row['Id'] || row['ID'] || '').toString().trim();
            const name = (row['name'] || row['Name'] || row['NAME'] || '').toString().trim();
            const nodeIdsRaw = (row['nodeIds'] || row['NodeIds'] || row['nodeids'] || row['node_ids'] || '').toString();
            const nodeIds = nodeIdsRaw
              .split(',')
              .map((v: string) => v.trim())
              .filter(Boolean);
            return { id, name, nodeIds };
          })
          .filter((row) => row.name && row.nodeIds.length); // Only require name and nodeIds, id can be empty for legacy rows
        
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

    const loadNodePaths = async () => {
      try {
        const response = await fetch(NODE_PATH_GVIZ_URL);
        if (!response.ok) {
          setNodePathMap({});
          return;
        }
        const rawText = await response.text();
        const jsonMatch = rawText.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
        const jsonText = jsonMatch?.[1];
        if (!jsonText) {
          setNodePathMap({});
          return;
        }
        const parsedJson = JSON.parse(jsonText);
        const rows: any[] = parsedJson?.table?.rows || [];
        // Columns: pathId, nodeId, content
        const values: Array<[string | null | undefined, string | null | undefined, string | null | undefined]> = rows.map((row: any) => [row.c?.[0]?.v, row.c?.[1]?.v, row.c?.[2]?.v]);
        const isHeaderRow = (row: Array<string | null | undefined>) => {
          const first = (row?.[0] || '').toString().toLowerCase();
          return first.includes('pathid') || first.includes('path');
        };
        const filtered = values.filter((row: Array<string | null | undefined>) => row && row.length >= 2 && row[0]);
        const effectiveRows = filtered.length && isHeaderRow(filtered[0]) ? filtered.slice(1) : filtered;
        
        // Build nested map: { pathId: { nodeId: content } }
        const map: Record<string, Record<string, string>> = {};
        effectiveRows.forEach((row) => {
          const pathId = (row[0] || '').toString().trim();
          const nodeId = (row[1] || '').toString().trim();
          const content = (row[2] || '').toString();
          if (pathId && nodeId) {
            if (!map[pathId]) map[pathId] = {};
            map[pathId][nodeId] = content;
          }
        });
        setNodePathMap(map);
      } catch {
        setNodePathMap({});
      }
    };

    loadPaths();
    loadNodePaths();
  }, []);

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      // Close any open popup when clicking a node
      setSelectedNode(null);
      
      // Only toggle selection, don't show popup (popup is triggered by info button)
      // Skip personalized nodes from toggling
      if (node.id.startsWith('personalized-')) return;
      
      // Block manual selection when a path is loaded - must use Reset View first
      if (activePath) return;
      
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
    [setNodes, enforceRootHidden, activePath]
  );

  const personalizeSelection = () => {
    if (manualHighlights.size === 0) return;

    // Get the rightmost position of current visible nodes
    const visibleNodes = nodes.filter((n) => !n.hidden && !n.id.startsWith('personalized-'));
    const maxX = Math.max(...visibleNodes.map((n) => n.position.x + nodeWidth), 0);
    const startX = maxX + 200; // Gap between original diagram and personalized section
    const startY = 50; // Starting vertical position
    const verticalSpacing = 160; // Vertical spacing between nodes

    // Get selected nodes data
    const selectedNodeIds = Array.from(manualHighlights);
    const selectedNodesData = nodes.filter((n) => selectedNodeIds.includes(n.id));

    // Get content from node-path if a path is active
    const pathContent = activePathId ? nodePathMap[activePathId] || {} : {};

    // Create duplicated nodes with unique IDs - straight vertical line
    const duplicatedNodes: Node[] = selectedNodesData.map((n, index) => {
      const nodeData = n.data as NodeData;
      const xPos = startX; // Same X for all (vertical line)
      const yPos = startY + (index * verticalSpacing); // Stacked vertically
      
      // Load content from node-path sheet if available
      const savedContent = pathContent[n.id] || '';
      
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
          onInfoClick: handleInfoClick,
          userNotes: savedContent,
          onNotesChange: handleNotesChange,
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
    const pathRow = pathsList.find(p => p.name === pathName);
    const pathNodes = pathsMap[pathName];
    if (!pathNodes?.length || !pathRow) {
      return;
    }
    setActivePath(pathName);
    // Use id if available, otherwise fallback to name as identifier
    setActivePathId(pathRow.id || pathRow.name);
    setSidebarNodeContent({}); // Reset content when switching paths
    setPathName(pathName); // Populate path name input with loaded path name
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
    setActivePathId(null);
    setManualHighlights(new Set());
    setSidebarNodeContent({});
    setPathName(''); // Clear path name input
    
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

  // Close popup when clicking on empty background
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div ref={flowRef} style={{ width: '100vw', height: '100vh', background: CANVAS_BG }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
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
          {/* App Title */}
          <h1 style={{ 
            margin: '0 0 16px 0', 
            fontSize: '18px', 
            fontWeight: '700', 
            color: '#1e293b',
            letterSpacing: '0.05em',
            textAlign: 'center',
          }}>
            UNBURDENED
          </h1>

          {(dataLoading || dataError) && (
            <div
              style={{
                marginBottom: '10px',
                padding: '8px',
                borderRadius: '8px',
                fontSize: '11px',
                background: dataError ? '#fef2f2' : '#f0f9ff',
                color: dataError ? '#b91c1c' : '#0369a1',
              }}
            >
              {dataError ? `Sheet error: ${dataError}` : 'Loading sheet data…'}
            </div>
          )}

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
              ✕ Clear Built ({personalizedNodes.length})
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
                Clear View
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

          {/* Node Content Editor - shows when a path is loaded */}
          {activePath && activePathId && manualHighlights.size > 0 && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '10px' }}>
                📝 Node Notes
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {Array.from(manualHighlights).map((nodeId) => {
                  const node = nodes.find(n => n.id === nodeId);
                  const nodeData = node?.data as NodeData | undefined;
                  const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
                  
                  return (
                    <div key={nodeId} style={{ marginBottom: '12px' }}>
                      <div style={{ 
                        fontSize: '10px', 
                        fontWeight: '600', 
                        color: nodeData?.color || '#64748b',
                        marginBottom: '4px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {nodeData?.label || nodeId}
                      </div>
                      <textarea
                        placeholder="Add notes..."
                        value={content}
                        onChange={(e) => {
                          const newContent = e.target.value;
                          setSidebarNodeContent(prev => ({ ...prev, [nodeId]: newContent }));
                          
                          // Also update nodePathMap so changes persist when switching paths
                          setNodePathMap(prev => ({
                            ...prev,
                            [activePathId]: {
                              ...(prev[activePathId] || {}),
                              [nodeId]: newContent,
                            },
                          }));
                          
                          // Debounced auto-save
                          if (debounceTimerRef.current[nodeId]) {
                            clearTimeout(debounceTimerRef.current[nodeId]);
                          }
                          debounceTimerRef.current[nodeId] = setTimeout(async () => {
                            try {
                              await fetch(GOOGLE_SCRIPT_URL, {
                                method: 'POST',
                                mode: 'no-cors',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'saveNodeContent',
                                  pathId: activePathId,
                                  nodeId: nodeId,
                                  content: newContent,
                                }),
                              });
                            } catch (error) {
                              console.error('Error saving node content:', error);
                            }
                          }, 1000);
                        }}
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '8px 10px',
                          fontSize: '11px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          background: 'white',
                          color: '#334155',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          lineHeight: 1.4,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom section with Build, Export, and Save */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '14px' }}>
            {/* Build button - only for manual selections, not loaded paths */}
            {!activePath && (
              <button
                onClick={personalizeSelection}
                disabled={manualHighlights.size === 0}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '8px',
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
                Create ({manualHighlights.size})
              </button>
            )}

            {/* Export PDF button */}
            <button
              onClick={exportToPDF}
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
              ↓ Export PDF
            </button>

            {/* Delete Path button - only visible when a path is loaded */}
            {activePath && (
              <button
                onClick={deletePath}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '8px',
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                  color: '#dc2626',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                }}
              >
                🗑 Delete Path
              </button>
            )}

            {/* Save section - path name input and save button */}
            {manualHighlights.size > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Enter path name..."
                  value={pathName}
                  onChange={(e) => setPathName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    marginBottom: '6px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: 'white',
                    color: '#334155',
                    boxSizing: 'border-box',
                  }}
                />
                {(() => {
                  const pathExists = pathsList.some(p => p.name === pathName.trim());
                  const isDisabled = saveStatus === 'saving' || !pathName.trim() || pathExists;
                  return (
                    <button
                      onClick={savePath}
                      disabled={isDisabled}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: saveStatus === 'success' 
                          ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                          : saveStatus === 'error'
                          ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
                          : pathExists
                          ? '#f1f5f9'
                          : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        color: saveStatus === 'success' 
                          ? '#047857'
                          : saveStatus === 'error'
                          ? '#b91c1c'
                          : pathExists
                          ? '#94a3b8'
                          : '#1d4ed8',
                        border: saveStatus === 'success'
                          ? '1px solid rgba(16, 185, 129, 0.3)'
                          : saveStatus === 'error'
                          ? '1px solid rgba(239, 68, 68, 0.3)'
                          : pathExists
                          ? '1px solid #e2e8f0'
                          : '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '10px',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        boxShadow: pathExists ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.08)',
                        opacity: !pathName.trim() ? 0.6 : 1,
                      }}
                    >
                      {saveStatus === 'saving' ? '⏳ Saving...' 
                        : saveStatus === 'success' ? '✓ Saved!' 
                        : saveStatus === 'error' ? '✕ Error' 
                        : pathExists ? '✓ Path exists'
                        : '💾 Save Path'}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
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

    {/* Node-path content editor - only when a path is loaded */}
    {activePathId && selectedNode && (() => {
      const nodeId = selectedNode.id.replace('personalized-', '');
      const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
      return (
        <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
            📝 Your Notes for this Node
          </div>
          <textarea
            placeholder="Add your notes for this node..."
            value={content}
            onChange={(e) => {
              const newContent = e.target.value;
              setSidebarNodeContent(prev => ({ ...prev, [nodeId]: newContent }));
              
              // Also update nodePathMap so changes persist when switching paths
              setNodePathMap(prev => ({
                ...prev,
                [activePathId]: {
                  ...(prev[activePathId] || {}),
                  [nodeId]: newContent,
                },
              }));
              
              // Debounced auto-save
              if (debounceTimerRef.current[nodeId]) {
                clearTimeout(debounceTimerRef.current[nodeId]);
              }
              debounceTimerRef.current[nodeId] = setTimeout(async () => {
                try {
                  await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'saveNodeContent',
                      pathId: activePathId,
                      nodeId: nodeId,
                      content: newContent,
                    }),
                  });
                } catch (error) {
                  console.error('Error saving node content:', error);
                }
              }, 1000);
            }}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: 'white',
              color: '#334155',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>
      );
    })()}
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