import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 240;
const nodeHeight = 80;

// Premium glass theme - clean whites and subtle accents
const CANVAS_BG = 'linear-gradient(145deg, #ffffff 0%, #fafcfe 50%, #f8fafc 100%)';
const NODE_SURFACE = 'rgba(247, 250, 252, 0.97)';
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

// Helper to format nodeIds for Google Sheets - adds trailing comma for single nodes
// to prevent Google Sheets from interpreting it as a number (which breaks gviz API)
function formatNodeIdsForSheet(nodeIds: string[] | Set<string>): string {
  const arr = Array.isArray(nodeIds) ? nodeIds : Array.from(nodeIds);
  const joined = arr.join(', ');
  // Add trailing comma if only one node to force text format
  return arr.length === 1 ? joined + ',' : joined;
}

// Helper to force text format for any value written to Google Sheets
// Prefix with single quote to prevent date/number interpretation
function forceTextForSheet(value: string): string {
  if (!value) return value;
  // Prefix with single quote to force text format in Google Sheets
  return "'" + value;
}

const SHEET_TSV_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/export?format=tsv';
const PATHS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/gviz/tq?sheet=paths&tqx=out:csv';
const NODE_PATH_GVIZ_URL =
  'https://docs.google.com/spreadsheets/d/1q8s_0uDQen16KD9bqDJJ_CzKQRB5vcBxI5V1dbNhWnQ/gviz/tq?sheet=node-path&tqx=out:json';

function MethodNode(props: any) {
  const data = props.data as NodeData & { 
    isHighlighted?: boolean; 
    onInfoClick?: (nodeId: string) => void;
    nodeNote?: string;
    onNodeNoteChange?: (nodeId: string, note: string) => void;
    editingNoteNodeId?: string | null;
    onStartEditNote?: (nodeId: string) => void;
    onStopEditNote?: () => void;
  };
  const isHighlighted = data.isHighlighted === true;
  const isEditing = data.editingNoteNodeId === props.id;
  const [localNote, setLocalNote] = useState(data.nodeNote || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Sync local note with prop when it changes externally
  useEffect(() => {
    setLocalNote(data.nodeNote || '');
  }, [data.nodeNote]);
  
  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      const lineHeight = 14; // ~10px font * 1.4 line-height
      const maxRows = 15;
      const maxHeight = lineHeight * maxRows;
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [localNote, isEditing]);
  
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

  const handleNoteAreaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isHighlighted && data.onStartEditNote) {
      data.onStartEditNote(props.id);
    }
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const newValue = e.target.value;
    setLocalNote(newValue);
    if (data.onNodeNoteChange) {
      data.onNodeNoteChange(props.id, newValue);
    }
  };

  const handleNoteBlur = () => {
    if (data.onStopEditNote) {
      data.onStopEditNote();
    }
  };

  // Get first line for preview
  const firstLine = (data.nodeNote || '').split('\n')[0];
  const hasNote = !!(data.nodeNote && data.nodeNote.trim());

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
        maxWidth: 220,
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
      
      {/* Note preview for unselected nodes that have notes */}
      {!isHighlighted && hasNote && (
        <div
          style={{
            marginTop: 6,
            borderTop: '1px solid rgba(100, 116, 139, 0.1)',
            paddingTop: 4,
            fontSize: 9,
            opacity: 0.5,
            fontStyle: 'italic',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#64748b',
          }}
        >
          {firstLine}
        </div>
      )}
      
      {/* Inline note area - only visible when highlighted */}
      {isHighlighted && (
        <div 
          onClick={handleNoteAreaClick}
          style={{ 
            marginTop: 8,
            borderTop: '1px solid rgba(59, 130, 246, 0.15)',
            paddingTop: 6,
          }}
        >
          {isEditing ? (
            <textarea
              ref={textareaRef}
              autoFocus
              value={localNote}
              onChange={handleNoteChange}
              onBlur={handleNoteBlur}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onWheelCapture={(e) => {
                // Stop the wheel event from reaching ReactFlow
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              placeholder="Add note..."
              style={{
                width: '100%',
                minHeight: '50px',
                maxHeight: '210px', // ~15 rows at 14px line height
                padding: '6px 8px',
                fontSize: 10,
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.9)',
                color: '#334155',
                resize: 'both',
                fontFamily: 'inherit',
                lineHeight: 1.4,
                boxSizing: 'border-box',
                outline: 'none',
                overflow: 'auto',
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 10,
                opacity: 0.6,
                fontStyle: 'italic',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'text',
              }}
            >
              {hasNote ? firstLine : '...'}
            </div>
          )}
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
        onMouseDown={(e) => e.stopPropagation()}
        onWheelCapture={(e) => {
          // Stop the wheel event from reaching ReactFlow
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
        }}
        style={{
          width: 240,
          minHeight: 90,
          padding: '12px 14px',
          fontSize: 13,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#334155',
          resize: 'both',
          fontFamily: 'inherit',
          lineHeight: 1.5,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
        }}
      />
    </div>
  );
}

// Path notes node - appears as first node in the path, shows path title and notes
function PathNotesNode(props: any) {
  const data = props.data as {
    pathName: string;
    pathNotes: string;
    isEditing: boolean;
    onStartEdit: () => void;
    onStopEdit: () => void;
    onNotesChange: (notes: string) => void;
  };
  const [localNotes, setLocalNotes] = useState(data.pathNotes || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Sync local notes with prop when it changes externally
  useEffect(() => {
    setLocalNotes(data.pathNotes || '');
  }, [data.pathNotes]);
  
  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current && data.isEditing) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      const lineHeight = 15; // ~11px font * 1.4 line-height
      const maxRows = 15;
      const maxHeight = lineHeight * maxRows;
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [localNotes, data.isEditing]);
  
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const newValue = e.target.value;
    setLocalNotes(newValue);
    if (data.onNotesChange) {
      data.onNotesChange(newValue);
    }
  };
  
  const previewText = (data.pathNotes || '').split('\n').slice(0, 2).join('\n') || 'Click to add path notes...';
  const hasNotes = !!(data.pathNotes && data.pathNotes.trim());
  
  return (
    <div
      style={{
        padding: '14px 16px',
        fontSize: 13,
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.95) 100%)',
        color: '#1e40af',
        border: '2px solid rgba(59, 130, 246, 0.4)',
        minWidth: 200,
        maxWidth: 400,
        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.18), 0 4px 20px rgba(59, 130, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1)',
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
      
      {/* Path name title */}
      <div style={{ 
        fontWeight: 700, 
        fontSize: 14, 
        marginBottom: 8, 
        textAlign: 'center',
        color: '#1e40af',
        borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
        paddingBottom: 8,
      }}>
        📋 {data.pathName || 'Path Notes'}
      </div>
      
      {/* Notes area */}
      <div 
        onClick={(e) => {
          e.stopPropagation();
          if (!data.isEditing && data.onStartEdit) {
            data.onStartEdit();
          }
        }}
        style={{ marginTop: 4 }}
      >
        {data.isEditing ? (
          <textarea
            ref={textareaRef}
            dir="ltr"
            autoFocus
            value={localNotes}
            onChange={handleNotesChange}
            onBlur={() => data.onStopEdit && data.onStopEdit()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onWheelCapture={(e) => {
              // Stop the wheel event from reaching ReactFlow
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            placeholder="Add path notes..."
            style={{
              width: '100%',
              minHeight: '80px',
              maxHeight: '225px', // ~15 rows at 15px line height
              padding: '8px 10px',
              fontSize: 11,
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.95)',
              color: '#334155',
              resize: 'both',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              boxSizing: 'border-box',
              outline: 'none',
              textAlign: 'left',
              direction: 'ltr',
              overflow: 'auto',
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 11,
              color: hasNotes ? '#334155' : '#94a3b8',
              fontStyle: hasNotes ? 'normal' : 'italic',
              cursor: 'text',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.4,
              minHeight: '40px',
              textAlign: 'left',
              padding: '4px',
              background: 'rgba(255, 255, 255, 0.5)',
              borderRadius: 6,
            }}
          >
            {previewText}
          </div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555', opacity: 0, width: 0, height: 0 }}
        isConnectable={false}
      />
    </div>
  );
}

const nodeTypes = { method: MethodNode, personalizedNode: PersonalizedNode, pathNotes: PathNotesNode };

type PathRow = {
  id: string;
  name: string;
  nodeIds: string[];
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  notes?: string;
  lastUpdated?: number; // timestamp for sorting by latest activity
};

// Helper to get unique categories from paths
function getUniqueCategories(paths: PathRow[]): string[] {
  const cats = new Set<string>();
  paths.forEach(p => {
    if (p.category) cats.add(p.category);
  });
  return Array.from(cats).sort();
}

function getSubcategories(paths: PathRow[], category: string): string[] {
  const subs = new Set<string>();
  paths.forEach(p => {
    if (p.category === category && p.subcategory) subs.add(p.subcategory);
  });
  return Array.from(subs).sort();
}

function getSubsubcategories(paths: PathRow[], category: string, subcategory: string): string[] {
  const subsubs = new Set<string>();
  paths.forEach(p => {
    if (p.category === category && p.subcategory === subcategory && p.subsubcategory) {
      subsubs.add(p.subsubcategory);
    }
  });
  return Array.from(subsubs).sort();
}

function DiagramContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [manualHighlights, setManualHighlights] = useState<Set<string>>(new Set());
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
  
  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedSubsubcategory, setSelectedSubsubcategory] = useState<string | null>(null);
  const [saveCategory, setSaveCategory] = useState('');
  const [saveSubcategory, setSaveSubcategory] = useState('');
  const [saveSubsubcategory, setSaveSubsubcategory] = useState('');
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<{name: string; level: 'category' | 'subcategory'} | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSubcategory, setShowAddSubcategory] = useState(false);
  const [showAddSubsubcategory, setShowAddSubsubcategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // Node filter state for filtering paths by node
  const [nodeFilterQuery, setNodeFilterQuery] = useState('');
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string | null>(null);
  const [showNodeFilterDropdown, setShowNodeFilterDropdown] = useState(false);
  
  // Path sort order: 'latest' (by last activity), 'alpha' (alphabetical), or 'category' (grouped by category)
  const [pathSortOrder, setPathSortOrder] = useState<'latest' | 'alpha' | 'category'>('latest');
  
  // Track last updated timestamps for each path (pathId -> timestamp)
  const [pathLastUpdated, setPathLastUpdated] = useState<Record<string, number>>({});
  
  // Panel position and size state for draggable/resizable panels
  const [leftPanelPos, setLeftPanelPos] = useState({ x: 20, y: 20 });
  const [leftPanelSize, setLeftPanelSize] = useState({ width: 220, height: 600 });
  const [infoPanelPos, setInfoPanelPos] = useState({ x: window.innerWidth - 400, y: 20 });
  const [infoPanelSize, setInfoPanelSize] = useState({ width: 360, height: 500 });
  const [notesPanelPos, setNotesPanelPos] = useState({ x: 260, y: 20 });
  const [notesPanelSize, setNotesPanelSize] = useState({ width: 280, height: 450 });
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [notesPathName, setNotesPathName] = useState<string | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState<'left' | 'info' | 'notes' | null>(null);
  const [resizeEdge, setResizeEdge] = useState<{ panel: 'left' | 'info' | 'notes'; edge: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, width: 0, height: 0, x: 0, y: 0 });
  
  // Inline note editing state
  const [editingNoteNodeId, setEditingNoteNodeId] = useState<string | null>(null);
  
  // Path-level notes state
  const [pathNotes, setPathNotes] = useState<Record<string, string>>({}); // pathId -> notes
  const [editingPathNotes, setEditingPathNotes] = useState<'panel' | 'node' | null>(null);
  
  // Path notes node ID (for the node that appears above the first node in a path)
  const PATH_NOTES_NODE_ID = '__path_notes__';
  
  // Temp path tracking for auto-save
  const [tempPathId, setTempPathId] = useState<string | null>(null);
  const tempPathCreatingRef = useRef<boolean>(false); // Prevent multiple temp path creations
  const [tempPathName, setTempPathName] = useState<string | null>(null);
  
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const nodeFilterRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activePathIdRef = useRef<string | null>(null);
  
  // Close node filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (nodeFilterRef.current && !nodeFilterRef.current.contains(e.target as HTMLElement)) {
        setShowNodeFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Keep ref in sync with state
  useEffect(() => {
    activePathIdRef.current = activePathId;
  }, [activePathId]);

  // Panel drag and resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPanel === 'left') {
        setLeftPanelPos({
          x: Math.max(0, e.clientX - dragOffset.x),
          y: Math.max(0, e.clientY - dragOffset.y),
        });
      } else if (isDraggingPanel === 'info') {
        setInfoPanelPos({
          x: Math.max(0, e.clientX - dragOffset.x),
          y: Math.max(0, e.clientY - dragOffset.y),
        });
      } else if (isDraggingPanel === 'notes') {
        setNotesPanelPos({
          x: Math.max(0, e.clientX - dragOffset.x),
          y: Math.max(0, e.clientY - dragOffset.y),
        });
      }
      
      if (resizeEdge) {
        const { panel, edge } = resizeEdge;
        const deltaX = e.clientX - resizeStart.mouseX;
        const deltaY = e.clientY - resizeStart.mouseY;
        
        const setPos = panel === 'left' ? setLeftPanelPos : panel === 'info' ? setInfoPanelPos : setNotesPanelPos;
        const setSize = panel === 'left' ? setLeftPanelSize : panel === 'info' ? setInfoPanelSize : setNotesPanelSize;
        const minW = panel === 'left' ? 180 : panel === 'notes' ? 220 : 280;
        const minH = 200;
        
        if (edge.includes('e')) {
          setSize(prev => ({ ...prev, width: Math.max(minW, resizeStart.width + deltaX) }));
        }
        if (edge.includes('w')) {
          const newWidth = Math.max(minW, resizeStart.width - deltaX);
          const newX = resizeStart.x + (resizeStart.width - newWidth);
          setSize(prev => ({ ...prev, width: newWidth }));
          setPos(prev => ({ ...prev, x: Math.max(0, newX) }));
        }
        if (edge.includes('s')) {
          setSize(prev => ({ ...prev, height: Math.max(minH, resizeStart.height + deltaY) }));
        }
        if (edge.includes('n')) {
          const newHeight = Math.max(minH, resizeStart.height - deltaY);
          const newY = resizeStart.y + (resizeStart.height - newHeight);
          setSize(prev => ({ ...prev, height: newHeight }));
          setPos(prev => ({ ...prev, y: Math.max(0, newY) }));
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingPanel(null);
      setResizeEdge(null);
    };

    if (isDraggingPanel || resizeEdge) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingPanel, resizeEdge, dragOffset, resizeStart]);

  // Google Apps Script Web App URL - you need to deploy your own script and paste the URL here
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxlQ5lLsgbTYVgtGzrU8KXN9RI31UKV-JSIJV7xfcsXJMWw2pEmMKsKnWOIlE1_L-LnhQ/exec';

  const highlightColor = HIGHLIGHT_COLOR;

  // Refs for callbacks to avoid re-render loops
  const handleInlineNoteChangeRef = useRef<(nodeId: string, note: string) => void>(() => {});
  const editingNoteNodeIdRef = useRef<string | null>(null);
  const sidebarNodeContentRef = useRef<Record<string, string>>({});
  const nodePathMapRef = useRef<Record<string, Record<string, string>>>({});
  const activePathIdForNotesRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    editingNoteNodeIdRef.current = editingNoteNodeId;
  }, [editingNoteNodeId]);
  
  useEffect(() => {
    sidebarNodeContentRef.current = sidebarNodeContent;
  }, [sidebarNodeContent]);
  
  useEffect(() => {
    nodePathMapRef.current = nodePathMap;
  }, [nodePathMap]);
  
  useEffect(() => {
    activePathIdForNotesRef.current = activePathId;
  }, [activePathId]);

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

  // Stable callbacks for inline note editing (use refs to avoid recreating)
  const handleStartEditNote = useCallback((nodeId: string) => {
    setEditingNoteNodeId(nodeId);
  }, []);

  const handleStopEditNote = useCallback(() => {
    setEditingNoteNodeId(null);
  }, []);

  // Path notes node handlers
  const handlePathNotesStartEdit = useCallback(() => {
    setEditingPathNotes('node');
  }, []);
  
  const handlePathNotesStopEdit = useCallback(() => {
    setEditingPathNotes(null);
  }, []);

  const handleNodeNoteChange = useCallback((nodeId: string, note: string) => {
    handleInlineNoteChangeRef.current(nodeId, note);
  }, []);

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

  // Generate temp path name
  const generateTempPathName = () => {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    return `temp_${timestamp}`;
  };

  // Create temp path when editing notes without an active path
  const createTempPathIfNeeded = useCallback(async () => {
    // Only create temp path if no active path and no temp path already exists
    if (activePathId || tempPathId) return tempPathId;
    if (manualHighlights.size === 0) return null;
    
    // Prevent multiple simultaneous temp path creations
    if (tempPathCreatingRef.current) return null;
    tempPathCreatingRef.current = true;
    
    const newTempName = generateTempPathName();
    const newTempId = generatePathId(newTempName);
    const nodeIds = formatNodeIdsForSheet(manualHighlights);
    
    try {
      // Save temp path to Google Sheets - use forceTextForSheet to prevent date/number interpretation
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'savePath',
          pathId: forceTextForSheet(newTempId),
          pathName: forceTextForSheet(newTempName),
          nodeIds: nodeIds,
          category: '',
          subcategory: '',
          subsubcategory: '',
        }),
      });
      
      setTempPathId(newTempId);
      setTempPathName(newTempName);
      tempPathCreatingRef.current = false;
      
      // Add to local paths list
      setPathsList(prev => [...prev, {
        id: newTempId,
        name: newTempName,
        nodeIds: Array.from(manualHighlights),
        category: '',
        subcategory: '',
        subsubcategory: '',
      }]);
      setPathsMap(prev => ({
        ...prev,
        [newTempName]: Array.from(manualHighlights),
      }));
      
      return newTempId;
    } catch (error) {
      console.error('Error creating temp path:', error);
      tempPathCreatingRef.current = false;
      return null;
    }
  }, [activePathId, tempPathId, manualHighlights, GOOGLE_SCRIPT_URL]);

  // Handler for path-level notes with debounced auto-save
  const handlePathNotesChange = useCallback(async (notes: string) => {
    let pathIdToUse = activePathId || tempPathId;
    
    // If no path exists, create a temp path first
    if (!pathIdToUse && manualHighlights.size > 0) {
      pathIdToUse = await createTempPathIfNeeded();
    }
    
    if (!pathIdToUse) return;
    
    // Update local state
    setPathNotes(prev => ({ ...prev, [pathIdToUse!]: notes }));
    
    // Update last updated timestamp
    setPathLastUpdated(prev => ({ ...prev, [pathIdToUse!]: Date.now() }));
    
    // Debounced auto-save
    if (debounceTimerRef.current['pathNotes']) {
      clearTimeout(debounceTimerRef.current['pathNotes']);
    }
    debounceTimerRef.current['pathNotes'] = setTimeout(async () => {
      try {
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'savePathNotes',
            pathId: pathIdToUse,
            notes: notes,
          }),
        });
      } catch (error) {
        console.error('Error saving path notes:', error);
      }
    }, 1000);
  }, [activePathId, tempPathId, manualHighlights, createTempPathIfNeeded, GOOGLE_SCRIPT_URL]);

  // Delete temp path (called when user manually saves)
  const deleteTempPath = useCallback(async () => {
    if (!tempPathId || !tempPathName) return;
    
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deletePath',
          pathId: tempPathId,
          pathName: tempPathName,
        }),
      });
      
      // Remove from local state
      setPathsList(prev => prev.filter(p => p.name !== tempPathName));
      setPathsMap(prev => {
        const newMap = { ...prev };
        delete newMap[tempPathName];
        return newMap;
      });
      
      setTempPathId(null);
      setTempPathName(null);
    } catch (error) {
      console.error('Error deleting temp path:', error);
    }
  }, [tempPathId, tempPathName, GOOGLE_SCRIPT_URL]);

  // Handler for inline node note changes with debounced auto-save
  const handleInlineNoteChange = useCallback(async (nodeId: string, note: string) => {
    // Update sidebar content state
    setSidebarNodeContent(prev => ({ ...prev, [nodeId]: note }));
    
    // Determine which path ID to use
    let pathIdToUse = activePathId;
    
    // If no active path, create temp path
    if (!pathIdToUse) {
      pathIdToUse = tempPathId || await createTempPathIfNeeded();
    }
    
    if (!pathIdToUse) return;
    
    // Update last updated timestamp
    setPathLastUpdated(prev => ({ ...prev, [pathIdToUse!]: Date.now() }));
    
    // Update nodePathMap
    setNodePathMap(prev => ({
      ...prev,
      [pathIdToUse!]: {
        ...(prev[pathIdToUse!] || {}),
        [nodeId]: note,
      },
    }));
    
    // Debounced auto-save
    if (debounceTimerRef.current[`inline-${nodeId}`]) {
      clearTimeout(debounceTimerRef.current[`inline-${nodeId}`]);
    }
    debounceTimerRef.current[`inline-${nodeId}`] = setTimeout(async () => {
      try {
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'saveNodeContent',
            pathId: pathIdToUse,
            nodeId: nodeId,
            content: note,
          }),
        });
      } catch (error) {
        console.error('Error saving inline note:', error);
      }
    }, 1000);
  }, [activePathId, tempPathId, createTempPathIfNeeded, GOOGLE_SCRIPT_URL]);

  // Keep the ref in sync with the handler
  useEffect(() => {
    handleInlineNoteChangeRef.current = handleInlineNoteChange;
  }, [handleInlineNoteChange]);

  // Sync nodes with inline note editing state and note content
  // Also triggers when dataLoading becomes false to ensure callbacks are attached after initial load
  useEffect(() => {
    setNodes((nds) => {
      // Don't update if no nodes yet
      if (nds.length === 0) return nds;
      
      return nds.map((n) => {
        if (n.id.startsWith('personalized-')) return n;
        
        // Get note content from sidebar content or nodePathMap
        const pathIdForNotes = activePathId || tempPathId;
        const noteContent = sidebarNodeContent[n.id] ?? 
          (pathIdForNotes ? nodePathMap[pathIdForNotes]?.[n.id] : undefined) ?? '';
        
        return {
          ...n,
          data: {
            ...n.data,
            nodeNote: noteContent,
            onNodeNoteChange: handleNodeNoteChange,
            editingNoteNodeId: editingNoteNodeId,
            onStartEditNote: handleStartEditNote,
            onStopEditNote: handleStopEditNote,
          },
        };
      });
    });
  }, [editingNoteNodeId, sidebarNodeContent, activePathId, tempPathId, nodePathMap, handleNodeNoteChange, handleStartEditNote, handleStopEditNote, dataLoading]);

  // Sync path notes node with editing state and path notes content
  useEffect(() => {
    const currentPathId = activePathId || tempPathId;
    if (!currentPathId || !activePath) return;
    
    setNodes((nds) => {
      return nds.map((n) => {
        if (n.id !== PATH_NOTES_NODE_ID) return n;
        
        return {
          ...n,
          data: {
            ...n.data,
            pathName: activePath,
            pathNotes: pathNotes[currentPathId] || '',
            isEditing: editingPathNotes === 'node',
            onStartEdit: handlePathNotesStartEdit,
            onStopEdit: handlePathNotesStopEdit,
            onNotesChange: handlePathNotesChange,
          },
        };
      });
    });
  }, [editingPathNotes, pathNotes, activePathId, tempPathId, activePath, handlePathNotesStartEdit, handlePathNotesStopEdit, handlePathNotesChange]);

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
    const nodeIds = formatNodeIdsForSheet(manualHighlights);
    setSaveStatus('saving');

    try {
      // Get the old temp path ID before deleting (for transferring notes)
      const oldTempPathId = tempPathId;
      
      // Delete temp path if it exists (user is manually saving)
      if (tempPathId) {
        await deleteTempPath();
      }
      
      // Save the path with category info - use forceTextForSheet for pathName to prevent date interpretation
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script requires no-cors
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'savePath',
          pathId: forceTextForSheet(pathId),
          pathName: forceTextForSheet(pathName.trim()),
          nodeIds: nodeIds,
          category: saveCategory.trim() || '',
          subcategory: saveSubcategory.trim() || '',
          subsubcategory: saveSubsubcategory.trim() || '',
          notes: pathNotes[oldTempPathId || ''] || pathNotes[activePathId || ''] || '',
        }),
      });

      // Transfer node notes from temp path to new path
      const sourcePathId = oldTempPathId || activePathId;
      if (sourcePathId && (nodePathMap[sourcePathId] || Object.keys(sidebarNodeContent).length > 0)) {
        const sourceContent = nodePathMap[sourcePathId] || {};
        
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
              pathId: forceTextForSheet(pathId),
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
      
      // Transfer path notes from temp path to new path
      if (sourcePathId && pathNotes[sourcePathId]) {
        setPathNotes(prev => ({
          ...prev,
          [pathId]: prev[sourcePathId] || '',
        }));
      }

      // With no-cors, we can't read the response, so we assume success
      setSaveStatus('success');
      
      // Add the new path to local state immediately so it appears in the list
      const nodeIdsArray = Array.from(manualHighlights);
      const newPathRow: PathRow = {
        id: pathId,
        name: pathName.trim(),
        nodeIds: nodeIdsArray,
        category: saveCategory.trim() || undefined,
        subcategory: saveSubcategory.trim() || undefined,
        subsubcategory: saveSubsubcategory.trim() || undefined,
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

  // Rename a path (with debounced auto-save)
  const renamePath = useCallback(async (oldName: string, newName: string) => {
    if (!oldName || !newName || oldName === newName) return;
    
    const pathRow = pathsList.find(p => p.name === oldName);
    if (!pathRow) return;
    
    // Check if new name already exists
    if (pathsList.some(p => p.name === newName && p.name !== oldName)) {
      console.error('Path name already exists');
      return;
    }
    
    // Clear existing debounce timer
    if (debounceTimerRef.current['renamePath']) {
      clearTimeout(debounceTimerRef.current['renamePath']);
    }
    
    debounceTimerRef.current['renamePath'] = setTimeout(async () => {
      try {
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'renamePath',
            pathId: pathRow.id,
            oldName: oldName,
            newName: newName,
          }),
        });
        
        // Update local state
        setPathsList(prev => prev.map(p => 
          p.name === oldName ? { ...p, name: newName } : p
        ));
        setPathsMap(prev => {
          const newMap = { ...prev };
          if (newMap[oldName]) {
            newMap[newName] = newMap[oldName];
            delete newMap[oldName];
          }
          return newMap;
        });
        
        // Update active path if it's the renamed one
        if (activePath === oldName) {
          setActivePath(newName);
        }
        if (notesPathName === oldName) {
          setNotesPathName(newName);
        }
      } catch (error) {
        console.error('Error renaming path:', error);
      }
    }, 1000);
  }, [pathsList, activePath, notesPathName, GOOGLE_SCRIPT_URL]);

  // Update path category (for drag and drop)
  const updatePathCategory = async (pathName: string, newCategory: string, newSubcategory?: string) => {
    const pathRow = pathsList.find(p => p.name === pathName);
    if (!pathRow) return;

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updatePathCategory',
          pathId: pathRow.id,
          pathName: pathName,
          category: newCategory,
          subcategory: newSubcategory || '',
          subsubcategory: '',
        }),
      });

      // Update local state
      setPathsList(prev => prev.map(p => 
        p.name === pathName 
          ? { ...p, category: newCategory || undefined, subcategory: newSubcategory || undefined, subsubcategory: undefined }
          : p
      ));
    } catch (error) {
      console.error('Error updating path category:', error);
    }
  };

  // Save a category placeholder (empty path with just category info)
  const saveCategoryPlaceholder = async (category: string, subcategory?: string, subsubcategory?: string) => {
    const placeholderId = `__cat__${category}${subcategory ? `__${subcategory}` : ''}${subsubcategory ? `__${subsubcategory}` : ''}`;
    
    // Check if this placeholder already exists
    if (pathsList.some(p => p.id === placeholderId)) {
      return; // Already exists
    }

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'savePath',
          pathId: forceTextForSheet(placeholderId),
          pathName: '', // Empty name indicates placeholder
          nodeIds: '',
          category: category,
          subcategory: subcategory || '',
          subsubcategory: subsubcategory || '',
        }),
      });

      // Add to local state
      const newPlaceholder: PathRow = {
        id: placeholderId,
        name: '',
        nodeIds: [],
        category: category || undefined,
        subcategory: subcategory || undefined,
        subsubcategory: subsubcategory || undefined,
      };
      setPathsList(prev => [...prev, newPlaceholder]);
    } catch (error) {
      console.error('Error saving category:', error);
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
            let id = (row['id'] || row['Id'] || row['ID'] || '').toString().trim();
            let name = (row['name'] || row['Name'] || row['NAME'] || '').toString().trim();
            // Remove leading single quote if present (from forceTextForSheet)
            if (id.startsWith("'")) id = id.slice(1);
            if (name.startsWith("'")) name = name.slice(1);
            const nodeIdsRaw = (row['nodeIds'] || row['NodeIds'] || row['nodeids'] || row['node_ids'] || '').toString();
            const nodeIds = nodeIdsRaw
              .split(',')
              .map((v: string) => v.trim())
              .filter(Boolean);
            const category = (row['category'] || row['Category'] || '').toString().trim() || undefined;
            const subcategory = (row['subcategory'] || row['Subcategory'] || row['subCategory'] || '').toString().trim() || undefined;
            const subsubcategory = (row['subsubcategory'] || row['Subsubcategory'] || row['subSubcategory'] || '').toString().trim() || undefined;
            const notes = (row['notes'] || row['Notes'] || '').toString().trim() || undefined;
            return { id, name, nodeIds, category, subcategory, subsubcategory, notes };
          })
          .filter((row) => row.name && row.nodeIds.length); // Only require name and nodeIds, id can be empty for legacy rows
        
        const map: Record<string, string[]> = {};
        const notesMap: Record<string, string> = {};
        list.forEach((row) => {
          map[row.name] = row.nodeIds;
          if (row.notes && row.id) {
            notesMap[row.id] = row.notes;
          }
        });
        setPathsList(list);
        setPathsMap(map);
        setPathNotes(notesMap);
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

  // Auto-save path nodes when they change (for active saved paths)
  const updatePathNodesRef = useRef<NodeJS.Timeout | null>(null);
  
  const updatePathNodes = useCallback(async (pathId: string, pathName: string, nodeIds: Set<string>) => {
    if (!pathId || nodeIds.size === 0) return;
    
    // Debounce to avoid too many saves on rapid clicking
    if (updatePathNodesRef.current) {
      clearTimeout(updatePathNodesRef.current);
    }
    
    updatePathNodesRef.current = setTimeout(async () => {
      const nodeIdsStr = formatNodeIdsForSheet(nodeIds);
      
      try {
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'updatePathNodes',
            pathId: forceTextForSheet(pathId),
            pathName: forceTextForSheet(pathName),
            nodeIds: nodeIdsStr,
          }),
        });
        
        // Update local state
        const nodeIdsArray = Array.from(nodeIds);
        setPathsList(prev => prev.map(p => 
          p.id === pathId ? { ...p, nodeIds: nodeIdsArray } : p
        ));
        setPathsMap(prev => ({
          ...prev,
          [pathName]: nodeIdsArray,
        }));
      } catch (error) {
        console.error('Error updating path nodes:', error);
      }
    }, 500); // 500ms debounce
  }, [GOOGLE_SCRIPT_URL]);

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      // Close any open popup when clicking a node
      setSelectedNode(null);
      
      // Only toggle selection, don't show popup (popup is triggered by info button)
      // Skip personalized nodes and path notes node from toggling
      if (node.id.startsWith('personalized-') || node.id === PATH_NOTES_NODE_ID) return;
      
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
        
        // Auto-save node changes for both saved paths AND temp paths
        if (activePath && activePathId) {
          // Update last updated timestamp
          setPathLastUpdated(prevUpdated => ({ ...prevUpdated, [activePathId]: Date.now() }));
          
          // Use setTimeout to ensure state is updated before saving
          setTimeout(() => {
            updatePathNodes(activePathId, activePath, next);
          }, 0);
        } else if (tempPathId && tempPathName) {
          // Also save for temp paths
          setPathLastUpdated(prevUpdated => ({ ...prevUpdated, [tempPathId]: Date.now() }));
          
          setTimeout(() => {
            updatePathNodes(tempPathId, tempPathName, next);
          }, 0);
        }
        
        return next;
      });
    },
    [setNodes, enforceRootHidden, activePath, activePathId, tempPathId, tempPathName, updatePathNodes]
  );

  const showPath = (pathName: string) => {
    const pathRow = pathsList.find(p => p.name === pathName);
    const pathNodes = pathsMap[pathName];
    if (!pathNodes?.length || !pathRow) {
      return;
    }
    setActivePath(pathName);
    // Use id if available, otherwise fallback to name as identifier
    const currentPathId = pathRow.id || pathRow.name;
    setActivePathId(currentPathId);
    setSidebarNodeContent({}); // Reset content when switching paths
    setPathName(pathName); // Populate path name input with loaded path name
    setEditingPathNotes(null); // Reset editing state
    // Reset to only the new path's nodes (don't accumulate between path buttons)
    setManualHighlights(new Set(pathNodes));
    setNodes((nds) => {
      // First update and layout the regular nodes
      const updated = enforceRootHidden(nds)
        .filter(n => n.id !== PATH_NOTES_NODE_ID) // Remove any existing path notes node
        .map((n) => {
          const isActive = pathNodes.includes(n.id);
          return {
            ...n,
            data: {
              ...n.data,
              isHighlighted: isActive, // Reset: only show this path's nodes
            },
          };
        });
      const layoutedNodes = getLayoutedNodes(updated, edges);
      
      // Find the topmost highlighted node to position the path notes node above it
      const highlightedNodes = layoutedNodes.filter(n => pathNodes.includes(n.id));
      if (highlightedNodes.length > 0) {
        const topNode = highlightedNodes.reduce((top, n) => n.position.y < top.position.y ? n : top, highlightedNodes[0]);
        
        // Create the path notes node positioned above the topmost node
        const pathNotesNode: Node = {
          id: PATH_NOTES_NODE_ID,
          type: 'pathNotes',
          position: {
            x: topNode.position.x - 20,
            y: topNode.position.y - 140,
          },
          data: {
            pathName: pathName,
            pathNotes: pathNotes[currentPathId] || '',
            isEditing: false,
            onStartEdit: handlePathNotesStartEdit,
            onStopEdit: handlePathNotesStopEdit,
            onNotesChange: handlePathNotesChange,
          },
          draggable: true,
          selectable: false,
        };
        
        return [...layoutedNodes, pathNotesNode];
      }
      
      return layoutedNodes;
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
    setTempPathId(null); // Clear temp path so new selections start fresh
    setTempPathName(null);
    setManualHighlights(new Set());
    setSidebarNodeContent({});
    setPathName(''); // Clear path name input
    setEditingPathNotes(null); // Reset editing state
    
    setNodes((nds) =>
      enforceRootHidden(nds)
        .filter(n => n.id !== PATH_NOTES_NODE_ID) // Remove path notes node
        .map((n) => ({
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

        {/* Left sidebar - draggable and resizable */}
        <div
          style={{ 
            position: 'absolute',
            left: leftPanelPos.x,
            top: leftPanelPos.y,
            zIndex: 10,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.95) 100%)', 
            padding: '18px', 
            borderRadius: '16px',
            height: leftPanelSize.height,
            overflowY: 'auto',
            width: leftPanelSize.width,
            boxShadow: '0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(59,130,246,0.04)',
            border: '1px solid rgba(226,232,240,0.8)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingPanel('left');
              setDragOffset({ x: e.clientX - leftPanelPos.x, y: e.clientY - leftPanelPos.y });
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '28px',
              cursor: 'move',
              background: 'linear-gradient(180deg, rgba(241,245,249,0.8) 0%, transparent 100%)',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ 
              width: '40px', 
              height: '4px', 
              background: '#cbd5e1', 
              borderRadius: '2px',
            }} />
          </div>
          
          {/* Edge resize handles */}
          {/* North edge */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'n' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
          {/* South edge */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 's' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
          {/* West edge */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'w' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, left: 0, width: 6, cursor: 'ew-resize' }} />
          {/* East edge */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'e' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, right: 0, width: 6, cursor: 'ew-resize' }} />
          {/* NW corner */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'nw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
          {/* NE corner */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'ne' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
          {/* SW corner */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'sw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
          {/* SE corner */}
          <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'left', edge: 'se' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: leftPanelSize.width, height: leftPanelSize.height, x: leftPanelPos.x, y: leftPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
          
          {/* Panel content - with padding top for drag handle */}
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 12px)' }}>
          {/* Sticky header section */}
          <div style={{ flexShrink: 0, paddingBottom: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}>
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

          {/* Paths section */}
          {pathsList.length > 0 && (
            <>
             
              
              {/* Node filter dropdown/autocomplete */}
              <div ref={nodeFilterRef} style={{ marginBottom: '12px', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="🔍 Filter by node..."
                    value={nodeFilterQuery}
                    onChange={(e) => {
                      setNodeFilterQuery(e.target.value);
                      setShowNodeFilterDropdown(true);
                    }}
                    onFocus={() => setShowNodeFilterDropdown(true)}
                    style={{
                      width: '100%',
                      padding: '8px 28px 8px 10px',
                      fontSize: '11px',
                      border: selectedNodeFilter ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: selectedNodeFilter ? 'rgba(239, 246, 255, 0.8)' : 'white',
                      color: '#334155',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {selectedNodeFilter && (
                    <button
                      onClick={() => {
                        setSelectedNodeFilter(null);
                        setNodeFilterQuery('');
                      }}
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontSize: '14px',
                        padding: '2px',
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {showNodeFilterDropdown && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      zIndex: 100,
                      marginTop: '4px',
                    }}
                  >
                    {(() => {
                      // Get unique node names from the nodes array
                      const nodeNames = nodes
                        .filter(n => !n.id.startsWith('personalized-'))
                        .map(n => ({ id: n.id, label: (n.data as NodeData)?.label || n.id }))
                        .filter(n => n.label.toLowerCase().includes(nodeFilterQuery.toLowerCase()))
                        .sort((a, b) => a.label.localeCompare(b.label));
                      
                      if (nodeNames.length === 0) {
                        return (
                          <div style={{ padding: '10px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                            No nodes found
                          </div>
                        );
                      }
                      
                      return nodeNames.slice(0, 50).map(node => (
                        <button
                          key={node.id}
                          onClick={() => {
                            setSelectedNodeFilter(node.id);
                            setNodeFilterQuery(node.label);
                            setShowNodeFilterDropdown(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: '11px',
                            textAlign: 'left',
                            border: 'none',
                            background: selectedNodeFilter === node.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            color: '#334155',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = selectedNodeFilter === node.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent'}
                        >
                          {node.label}
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
              
              {/* Category chips - always visible */}
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '6px', 
                marginBottom: '8px',
              }}>
                {/* All chip */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    setSelectedSubcategory(null);
                    setSelectedSubsubcategory(null);
                    setSaveCategory('');
                    setSaveSubcategory('');
                    setSaveSubsubcategory('');
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedPath) {
                      updatePathCategory(draggedPath, '', '');
                      setDraggedPath(null);
                    }
                  }}
                  style={{
                    padding: '5px 10px',
                    fontSize: '10px',
                    fontWeight: selectedCategory === null ? '600' : '500',
                    borderRadius: '12px',
                    border: selectedCategory === null 
                      ? '1px solid rgba(59, 130, 246, 0.5)' 
                      : '1px solid #e2e8f0',
                    background: selectedCategory === null 
                      ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                      : 'rgba(255,255,255,0.6)',
                    color: selectedCategory === null ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: selectedCategory === null ? '0 1px 3px rgba(59, 130, 246, 0.15)' : 'none',
                  }}
                >
                  All ({pathsList.filter(p => p.name).length})
                </button>
                
                {/* Category chips */}
                {getUniqueCategories(pathsList).map(cat => (
                  <button
                    type="button"
                    key={cat}
                    draggable
                    onDragStart={() => setDraggedCategory({ name: cat, level: 'category' })}
                    onDragEnd={() => setDraggedCategory(null)}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedSubcategory(null);
                      setSelectedSubsubcategory(null);
                      setSaveCategory(cat);
                      setSaveSubcategory('');
                      setSaveSubsubcategory('');
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.transform = 'scale(1)';
                      if (draggedPath) {
                        updatePathCategory(draggedPath, cat, '');
                        setDraggedPath(null);
                      }
                      // Handle dropping a category onto another category to nest it
                      if (draggedCategory && draggedCategory.name !== cat) {
                        // Move all paths from dragged category to be subcategories of target
                        const pathsToMove = pathsList.filter(p => p.category === draggedCategory.name);
                        pathsToMove.forEach(p => {
                          updatePathCategory(p.name, cat, draggedCategory.name);
                        });
                        setDraggedCategory(null);
                      }
                    }}
                    style={{
                      padding: '5px 10px',
                      fontSize: '10px',
                      fontWeight: selectedCategory === cat ? '600' : '500',
                      borderRadius: '12px',
                      border: selectedCategory === cat 
                        ? '1px solid rgba(59, 130, 246, 0.5)' 
                        : '1px solid rgba(59, 130, 246, 0.2)',
                      background: selectedCategory === cat 
                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                        : 'rgba(239, 246, 255, 0.5)',
                      color: selectedCategory === cat ? '#1d4ed8' : '#3b82f6',
                      cursor: 'grab',
                      boxShadow: selectedCategory === cat ? '0 1px 3px rgba(59, 130, 246, 0.15)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    {cat} ({pathsList.filter(p => p.name && p.category === cat).length})
                  </button>
                ))}
                
                {/* Uncategorized chip - same style as other categories */}
                {pathsList.some(p => p.name && !p.category) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('__uncategorized__');
                      setSelectedSubcategory(null);
                      setSelectedSubsubcategory(null);
                    }}
                    style={{
                      padding: '5px 10px',
                      fontSize: '10px',
                      fontWeight: selectedCategory === '__uncategorized__' ? '600' : '500',
                      borderRadius: '12px',
                      border: selectedCategory === '__uncategorized__' 
                        ? '1px solid rgba(59, 130, 246, 0.5)' 
                        : '1px solid rgba(59, 130, 246, 0.2)',
                      background: selectedCategory === '__uncategorized__' 
                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                        : 'rgba(239, 246, 255, 0.5)',
                      color: selectedCategory === '__uncategorized__' ? '#1d4ed8' : '#3b82f6',
                      cursor: 'pointer',
                      fontStyle: 'italic',
                      boxShadow: selectedCategory === '__uncategorized__' ? '0 1px 3px rgba(59, 130, 246, 0.15)' : 'none',
                    }}
                  >
                    Uncategorized ({pathsList.filter(p => p.name && !p.category).length})
                  </button>
                )}
                
                {/* Add category button or input */}
                {!showAddCategory ? (
                  <button
                    type="button"
                    onClick={() => setShowAddCategory(true)}
                    style={{
                      padding: '5px 10px',
                      fontSize: '10px',
                      fontWeight: '500',
                      borderRadius: '12px',
                      border: '1px dashed rgba(59, 130, 246, 0.4)',
                      background: 'transparent',
                      color: '#3b82f6',
                      cursor: 'pointer',
                    }}
                  >
                    +
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="New category..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newCategoryName.trim()) {
                          // Save category placeholder to Google Sheets
                          saveCategoryPlaceholder(newCategoryName.trim());
                          setSaveCategory(newCategoryName.trim());
                          setSelectedCategory(newCategoryName.trim());
                          setSelectedSubcategory(null);
                          setSelectedSubsubcategory(null);
                          setNewCategoryName('');
                          setShowAddCategory(false);
                        }
                        if (e.key === 'Escape') {
                          setNewCategoryName('');
                          setShowAddCategory(false);
                        }
                      }}
                      autoFocus
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        background: 'white',
                        color: '#334155',
                        width: '100px',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newCategoryName.trim()) {
                          // Save category placeholder to Google Sheets
                          saveCategoryPlaceholder(newCategoryName.trim());
                          setSaveCategory(newCategoryName.trim());
                          setSelectedCategory(newCategoryName.trim());
                          setSelectedSubcategory(null);
                          setSelectedSubsubcategory(null);
                          setNewCategoryName('');
                          setShowAddCategory(false);
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#3b82f6',
                        color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategoryName('');
                        setShowAddCategory(false);
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#f1f5f9',
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              
              {/* Subcategory chips - show when category selected */}
              {selectedCategory && selectedCategory !== '__uncategorized__' && (
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '6px', 
                  marginBottom: '8px',
                  paddingLeft: '12px',
                }}>
                  {getSubcategories(pathsList, selectedCategory).map(sub => {
                    const count = pathsList.filter(p => p.name && p.category === selectedCategory && p.subcategory === sub).length;
                    return (
                      <button
                        type="button"
                        key={sub}
                        draggable
                        onDragStart={() => setDraggedCategory({ name: sub, level: 'subcategory' })}
                        onDragEnd={() => setDraggedCategory(null)}
                        onClick={() => {
                          setSelectedSubcategory(sub);
                          setSelectedSubsubcategory(null);
                          setSaveSubcategory(sub);
                          setSaveSubsubcategory('');
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedPath) {
                            updatePathCategory(draggedPath, selectedCategory, sub);
                            setDraggedPath(null);
                          }
                        }}
                        style={{
                          padding: '5px 10px',
                          fontSize: '10px',
                          fontWeight: selectedSubcategory === sub ? '600' : '500',
                          borderRadius: '12px',
                          border: selectedSubcategory === sub 
                            ? '1px solid rgba(16, 185, 129, 0.5)' 
                            : '1px solid rgba(16, 185, 129, 0.2)',
                          background: selectedSubcategory === sub 
                            ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' 
                            : 'rgba(236, 253, 245, 0.5)',
                          color: selectedSubcategory === sub ? '#047857' : '#10b981',
                          cursor: 'grab',
                          boxShadow: selectedSubcategory === sub ? '0 1px 3px rgba(16, 185, 129, 0.15)' : 'none',
                        }}
                      >
                        {sub} ({count})
                      </button>
                    );
                  })}
                  
                  {/* Add subcategory button or input */}
                  {!showAddSubcategory ? (
                    <button
                      type="button"
                      onClick={() => setShowAddSubcategory(true)}
                      style={{
                        padding: '5px 10px',
                        fontSize: '10px',
                        fontWeight: '500',
                        borderRadius: '12px',
                        border: '1px dashed rgba(16, 185, 129, 0.4)',
                        background: 'transparent',
                        color: '#10b981',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="New subcategory..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCategoryName.trim()) {
                            // Save subcategory placeholder to Google Sheets
                            saveCategoryPlaceholder(selectedCategory!, newCategoryName.trim());
                            setSaveSubcategory(newCategoryName.trim());
                            setSelectedSubcategory(newCategoryName.trim());
                            setSelectedSubsubcategory(null);
                            setNewCategoryName('');
                            setShowAddSubcategory(false);
                          }
                          if (e.key === 'Escape') {
                            setNewCategoryName('');
                            setShowAddSubcategory(false);
                          }
                        }}
                        autoFocus
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          background: 'white',
                          color: '#334155',
                          width: '100px',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            // Save subcategory placeholder to Google Sheets
                            saveCategoryPlaceholder(selectedCategory!, newCategoryName.trim());
                            setSaveSubcategory(newCategoryName.trim());
                            setSelectedSubcategory(newCategoryName.trim());
                            setSelectedSubsubcategory(null);
                            setNewCategoryName('');
                            setShowAddSubcategory(false);
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#10b981',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCategoryName('');
                          setShowAddSubcategory(false);
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#f1f5f9',
                          color: '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Sub-subcategory chips - show when subcategory selected */}
              {selectedSubcategory && (
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '6px', 
                  marginBottom: '8px',
                  paddingLeft: '24px',
                }}>
                  {getSubsubcategories(pathsList, selectedCategory === '__uncategorized__' ? '' : selectedCategory!, selectedSubcategory).map(subsub => {
                    const count = pathsList.filter(p => 
                      p.name &&
                      p.category === (selectedCategory === '__uncategorized__' ? '' : selectedCategory) && 
                      p.subcategory === selectedSubcategory && 
                      p.subsubcategory === subsub
                    ).length;
                    return (
                      <button
                        type="button"
                        key={subsub}
                        onClick={() => {
                          setSelectedSubsubcategory(subsub);
                          setSaveSubsubcategory(subsub);
                        }}
                        style={{
                          padding: '5px 10px',
                          fontSize: '10px',
                          fontWeight: selectedSubsubcategory === subsub ? '600' : '500',
                          borderRadius: '12px',
                          border: selectedSubsubcategory === subsub 
                            ? '1px solid rgba(168, 85, 247, 0.5)' 
                            : '1px solid rgba(168, 85, 247, 0.2)',
                          background: selectedSubsubcategory === subsub 
                            ? 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' 
                            : 'rgba(250, 245, 255, 0.5)',
                          color: selectedSubsubcategory === subsub ? '#7c3aed' : '#a855f7',
                          cursor: 'pointer',
                          boxShadow: selectedSubsubcategory === subsub ? '0 1px 3px rgba(168, 85, 247, 0.15)' : 'none',
                        }}
                      >
                        {subsub} ({count})
                      </button>
                    );
                  })}
                  
                  {/* Add sub-subcategory button or input */}
                  {!showAddSubsubcategory ? (
                    <button
                      type="button"
                      onClick={() => setShowAddSubsubcategory(true)}
                      style={{
                        padding: '5px 10px',
                        fontSize: '10px',
                        fontWeight: '500',
                        borderRadius: '12px',
                        border: '1px dashed rgba(168, 85, 247, 0.4)',
                        background: 'transparent',
                        color: '#a855f7',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="New sub-sub..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCategoryName.trim()) {
                            // Save sub-subcategory placeholder to Google Sheets
                            saveCategoryPlaceholder(selectedCategory!, selectedSubcategory!, newCategoryName.trim());
                            setSaveSubsubcategory(newCategoryName.trim());
                            setSelectedSubsubcategory(newCategoryName.trim());
                            setNewCategoryName('');
                            setShowAddSubsubcategory(false);
                          }
                          if (e.key === 'Escape') {
                            setNewCategoryName('');
                            setShowAddSubsubcategory(false);
                          }
                        }}
                        autoFocus
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          background: 'white',
                          color: '#334155',
                          width: '90px',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            // Save sub-subcategory placeholder to Google Sheets
                            saveCategoryPlaceholder(selectedCategory!, selectedSubcategory!, newCategoryName.trim());
                            setSaveSubsubcategory(newCategoryName.trim());
                            setSelectedSubsubcategory(newCategoryName.trim());
                            setNewCategoryName('');
                            setShowAddSubsubcategory(false);
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#a855f7',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCategoryName('');
                          setShowAddSubsubcategory(false);
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#f1f5f9',
                          color: '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              <button
                onClick={resetView}
                style={{
                  width: '100%',
                  padding: '9px',
                  marginBottom: '8px',
                  background: activePath !== null 
                    ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  color: activePath !== null ? '#1d4ed8' : '#64748b',
                  border: activePath !== null 
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

              {/* Sort control */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                marginBottom: '10px',
                padding: '4px 0',
              }}>
                <span style={{ fontSize: '9px', color: '#94a3b8' }}>Sort:</span>
                <button
                  onClick={() => setPathSortOrder('latest')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '9px',
                    fontWeight: pathSortOrder === 'latest' ? '600' : '400',
                    background: pathSortOrder === 'latest' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                    color: pathSortOrder === 'latest' ? '#1d4ed8' : '#64748b',
                    border: pathSortOrder === 'latest' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Latest
                </button>
                <button
                  onClick={() => setPathSortOrder('alpha')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '9px',
                    fontWeight: pathSortOrder === 'alpha' ? '600' : '400',
                    background: pathSortOrder === 'alpha' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                    color: pathSortOrder === 'alpha' ? '#1d4ed8' : '#64748b',
                    border: pathSortOrder === 'alpha' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  A-Z
                </button>
                <button
                  onClick={() => setPathSortOrder('category')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '9px',
                    fontWeight: pathSortOrder === 'category' ? '600' : '400',
                    background: pathSortOrder === 'category' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                    color: pathSortOrder === 'category' ? '#1d4ed8' : '#64748b',
                    border: pathSortOrder === 'category' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Category
                </button>
              </div>
            </>
          )}
          </div>
          {/* End of sticky header */}

          {/* Scrollable paths list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {pathsList.length > 0 && (
            <>
              {/* Filtered and grouped paths list */}
              {(() => {
                // Filter paths first
                const filteredPaths = pathsList.filter(path => {
                  // Filter out category placeholders (empty names)
                  if (!path.name) return false;
                  
                  // Filter by selected node (if any)
                  if (selectedNodeFilter) {
                    const pathNodeIds = pathsMap[path.name] || [];
                    if (!pathNodeIds.includes(selectedNodeFilter)) {
                      return false;
                    }
                  }
                  
                  // Filter by selected category hierarchy
                  if (selectedCategory === '__uncategorized__') {
                    return !path.category;
                  }
                  if (selectedSubsubcategory) {
                    return path.category === selectedCategory && 
                           path.subcategory === selectedSubcategory && 
                           path.subsubcategory === selectedSubsubcategory;
                  }
                  if (selectedSubcategory) {
                    return path.category === selectedCategory && path.subcategory === selectedSubcategory;
                  }
                  if (selectedCategory) {
                    return path.category === selectedCategory;
                  }
                  return true;
                });
                
                // Sort based on selected sort order
                let sortedPaths: PathRow[];
                if (pathSortOrder === 'alpha') {
                  // Alphabetical sort - flat list, no category grouping
                  sortedPaths = [...filteredPaths].sort((a, b) => a.name.localeCompare(b.name));
                } else if (pathSortOrder === 'latest') {
                  // Latest updated sort - flat list, sorted by most recently updated
                  sortedPaths = [...filteredPaths].sort((a, b) => {
                    const aTime = pathLastUpdated[a.id] || 0;
                    const bTime = pathLastUpdated[b.id] || 0;
                    return bTime - aTime; // Descending (most recent first)
                  });
                } else {
                  // Category sort - keep original order within categories
                  sortedPaths = filteredPaths;
                }
                
                // Only group by category when in 'category' sort mode
                if (pathSortOrder === 'category') {
                  // Group by category (alphabetically sorted categories)
                  const groupedPaths: Record<string, PathRow[]> = {};
                  sortedPaths.forEach(path => {
                    const cat = path.category || '__uncategorized__';
                    if (!groupedPaths[cat]) groupedPaths[cat] = [];
                    groupedPaths[cat].push(path);
                  });
                  
                  // Sort category keys alphabetically, with uncategorized at the end
                  const sortedCategories = Object.keys(groupedPaths).sort((a, b) => {
                    if (a === '__uncategorized__') return 1;
                    if (b === '__uncategorized__') return -1;
                    return a.localeCompare(b);
                  });
                  
                  return sortedCategories.map(cat => (
                    <div key={cat}>
                      {/* Category header - only show if not filtering by specific category */}
                      {!selectedCategory && sortedCategories.length > 1 && (
                        <div style={{ 
                          fontSize: '9px', 
                          fontWeight: '600', 
                          color: '#94a3b8', 
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginTop: cat === sortedCategories[0] ? 0 : '12px',
                          marginBottom: '6px',
                          paddingBottom: '4px',
                          borderBottom: '1px solid #f1f5f9',
                        }}>
                          {cat === '__uncategorized__' ? 'Uncategorized' : cat}
                        </div>
                      )}
                      {groupedPaths[cat].map((path) => (
                      <div
                        key={path.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginBottom: '5px',
                        }}
                      >
                        <button
                          draggable
                          onDragStart={() => setDraggedPath(path.name)}
                          onDragEnd={() => setDraggedPath(null)}
                          onClick={() => showPath(path.name)}
                          style={{
                            flex: 1,
                            padding: '9px 10px',
                            background: activePath === path.name 
                              ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                              : 'rgba(255,255,255,0.6)',
                            color: activePath === path.name ? '#1d4ed8' : '#475569',
                            border: activePath === path.name 
                              ? '1px solid rgba(59, 130, 246, 0.3)' 
                              : '1px solid #e2e8f0',
                            borderRadius: '8px',
                            cursor: 'grab',
                            fontSize: '11px',
                            textAlign: 'left',
                            fontWeight: activePath === path.name ? '600' : '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          {/* Drag handle */}
                          <span style={{ 
                            color: '#94a3b8', 
                            fontSize: '10px',
                            lineHeight: 1,
                            cursor: 'grab',
                          }}>⋮⋮</span>
                          <span style={{ flex: 1 }}>{path.name}</span>
                        </button>
                        {/* Info button for notes */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Load the path first if not already loaded
                            if (activePath !== path.name) {
                              showPath(path.name);
                            }
                            setNotesPathName(path.name);
                            setShowNotesPanel(true);
                            // Pre-populate category fields from path
                            setSaveCategory(path.category || '');
                            setSaveSubcategory(path.subcategory || '');
                            setSaveSubsubcategory(path.subsubcategory || '');
                            // Position notes panel next to left panel
                            setNotesPanelPos({ x: leftPanelPos.x + leftPanelSize.width + 10, y: leftPanelPos.y });
                          }}
                          style={{
                            padding: '6px 8px',
                            background: (showNotesPanel && notesPathName === path.name)
                              ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'
                              : 'rgba(255,255,255,0.8)',
                            color: (showNotesPanel && notesPathName === path.name) ? '#1d4ed8' : '#64748b',
                            border: (showNotesPanel && notesPathName === path.name)
                              ? '1px solid rgba(59, 130, 246, 0.4)'
                              : '1px solid #e2e8f0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '600',
                            lineHeight: 1,
                          }}
                          title="View notes"
                        >
                          ℹ
                        </button>
                      </div>
                      ))}
                    </div>
                  ));
                }
                
                // For 'latest' and 'alpha' modes - flat list without category headers
                return sortedPaths.map((path) => (
                  <div
                    key={path.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginBottom: '5px',
                    }}
                  >
                    <button
                      draggable
                      onDragStart={() => setDraggedPath(path.name)}
                      onDragEnd={() => setDraggedPath(null)}
                      onClick={() => showPath(path.name)}
                      style={{
                        flex: 1,
                        padding: '9px 10px',
                        background: activePath === path.name 
                          ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                          : 'rgba(255,255,255,0.6)',
                        color: activePath === path.name ? '#1d4ed8' : '#475569',
                        border: activePath === path.name 
                          ? '1px solid rgba(59, 130, 246, 0.3)' 
                          : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        cursor: 'grab',
                        fontSize: '11px',
                        textAlign: 'left',
                        fontWeight: activePath === path.name ? '600' : '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {/* Drag handle */}
                      <span style={{ 
                        color: '#94a3b8', 
                        fontSize: '10px',
                        lineHeight: 1,
                        cursor: 'grab',
                      }}>⋮⋮</span>
                      <span style={{ flex: 1 }}>{path.name}</span>
                    </button>
                    {/* Info button for notes */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Load the path first if not already loaded
                        if (activePath !== path.name) {
                          showPath(path.name);
                        }
                        setNotesPathName(path.name);
                        setShowNotesPanel(true);
                        // Pre-populate category fields from path
                        setSaveCategory(path.category || '');
                        setSaveSubcategory(path.subcategory || '');
                        setSaveSubsubcategory(path.subsubcategory || '');
                        // Position notes panel next to left panel
                        setNotesPanelPos({ x: leftPanelPos.x + leftPanelSize.width + 10, y: leftPanelPos.y });
                      }}
                      style={{
                        padding: '6px 8px',
                        background: (showNotesPanel && notesPathName === path.name)
                          ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'
                          : 'rgba(255,255,255,0.8)',
                        color: (showNotesPanel && notesPathName === path.name) ? '#1d4ed8' : '#64748b',
                        border: (showNotesPanel && notesPathName === path.name)
                          ? '1px solid rgba(59, 130, 246, 0.4)'
                          : '1px solid #e2e8f0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        lineHeight: 1,
                      }}
                      title="View notes"
                    >
                      ℹ
                    </button>
                  </div>
                ));
              })()}
              {/* End of scrollable paths list */}
            </>
          )}
          </div>
        </div>
        </div>

        {/* Notes Panel - shows when clicking info button on a path */}
        {showNotesPanel && notesPathName && (activePathId || tempPathId) && (
          <div
            style={{
              position: 'absolute',
              left: notesPanelPos.x,
              top: notesPanelPos.y,
              zIndex: 11,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.95) 100%)',
              padding: '18px',
              borderRadius: '14px',
              width: notesPanelSize.width,
              height: notesPanelSize.height,
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(15,23,42,0.12), 0 2px 8px rgba(59,130,246,0.06)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Drag handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingPanel('notes');
                setDragOffset({ x: e.clientX - notesPanelPos.x, y: e.clientY - notesPanelPos.y });
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '28px',
                cursor: 'move',
                background: 'linear-gradient(180deg, rgba(241,245,249,0.8) 0%, transparent 100%)',
                borderTopLeftRadius: '14px',
                borderTopRightRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: '40px', height: '4px', background: '#cbd5e1', borderRadius: '2px' }} />
            </div>
            
            {/* Edge resize handles */}
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'n' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 's' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'w' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, left: 0, width: 6, cursor: 'ew-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'e' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, right: 0, width: 6, cursor: 'ew-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'nw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'ne' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'sw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
            <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'notes', edge: 'se' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: notesPanelSize.width, height: notesPanelSize.height, x: notesPanelPos.x, y: notesPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
            
            {/* Close button */}
            <button
              onClick={() => setShowNotesPanel(false)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                color: '#64748b',
                padding: '4px',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              ✕
            </button>
            
            {/* Panel content */}
            <div style={{ marginTop: '14px' }}>
              {/* Editable path name */}
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📝 
                {activePath ? (
                  <input
                    type="text"
                    value={notesPathName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const oldName = notesPathName;
                      setNotesPathName(newName);
                      if (newName.trim() && newName !== oldName) {
                        renamePath(oldName, newName.trim());
                      }
                    }}
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#1e293b',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      background: 'transparent',
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.target.style.border = '1px solid #e2e8f0';
                      e.target.style.background = 'white';
                    }}
                    onBlur={(e) => {
                      e.target.style.border = '1px solid transparent';
                      e.target.style.background = 'transparent';
                    }}
                  />
                ) : (
                  <span>{notesPathName}</span>
                )}
              </div>
              
              {/* Path-level notes section - FIRST */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ 
                  fontSize: '10px', 
                  fontWeight: '600', 
                  color: '#64748b',
                  marginBottom: '6px',
                }}>
                  📋 Path Notes
                </div>
                <textarea
                  dir="ltr"
                  placeholder="Add path-level notes..."
                  value={pathNotes[activePathId || tempPathId || ''] || ''}
                  onClick={() => setEditingPathNotes('panel')}
                  onBlur={() => setEditingPathNotes(null)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onWheelCapture={(e) => {
                    // Stop the wheel event from reaching ReactFlow
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onChange={(e) => {
                    handlePathNotesChange(e.target.value);
                    // Auto-resize
                    const textarea = e.target;
                    textarea.style.height = 'auto';
                    const maxHeight = 225; // ~15 rows
                    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                  }}
                  onFocus={(e) => {
                    // Auto-resize on focus
                    const textarea = e.target;
                    textarea.style.height = 'auto';
                    const maxHeight = 225;
                    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                  }}
                  style={{
                    width: '100%',
                    minHeight: editingPathNotes === 'panel' ? '100px' : '50px',
                    maxHeight: '225px',
                    padding: '8px 10px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: 'white',
                    color: '#334155',
                    resize: 'both',
                    fontFamily: 'inherit',
                    lineHeight: 1.4,
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    direction: 'ltr',
                    overflow: 'auto',
                  }}
                />
              </div>
              
              {/* Controls section - Save, Delete, Export */}
              <div style={{ marginBottom: '16px', paddingTop: '12px', paddingBottom: '12px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                {/* Category selection - show for both new paths AND existing paths */}
                {(manualHighlights.size > 0 || activePath) && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>Category {activePath ? '' : '(optional)'}</div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      <input
                        type="text"
                        list="panel-category-list"
                        placeholder="Category..."
                        value={saveCategory}
                        onChange={(e) => {
                          setSaveCategory(e.target.value);
                          setSaveSubcategory('');
                          setSaveSubsubcategory('');
                        }}
                        onBlur={() => {
                          // For existing paths, save the category change on blur
                          if (activePath && notesPathName) {
                            updatePathCategory(notesPathName, saveCategory, saveSubcategory);
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          fontSize: '10px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          background: 'white',
                          color: '#334155',
                          boxSizing: 'border-box',
                        }}
                      />
                      <datalist id="panel-category-list">
                        {getUniqueCategories(pathsList).map(cat => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                      {saveCategory && (
                        <>
                          <input
                            type="text"
                            list="panel-subcategory-list"
                            placeholder="Sub..."
                            value={saveSubcategory}
                            onChange={(e) => {
                              setSaveSubcategory(e.target.value);
                              setSaveSubsubcategory('');
                            }}
                            onBlur={() => {
                              // For existing paths, save the category change on blur
                              if (activePath && notesPathName) {
                                updatePathCategory(notesPathName, saveCategory, saveSubcategory);
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              fontSize: '10px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              background: 'white',
                              color: '#334155',
                              boxSizing: 'border-box',
                            }}
                          />
                          <datalist id="panel-subcategory-list">
                            {getSubcategories(pathsList, saveCategory).map(sub => (
                              <option key={sub} value={sub} />
                            ))}
                          </datalist>
                        </>
                      )}
                      {saveSubcategory && (
                        <>
                          <input
                            type="text"
                            list="panel-subsubcategory-list"
                            placeholder="Sub-sub..."
                            value={saveSubsubcategory}
                            onChange={(e) => setSaveSubsubcategory(e.target.value)}
                            onBlur={() => {
                              // For existing paths, save the category change on blur
                              if (activePath && notesPathName) {
                                // Need to also update subsubcategory
                                const pathRow = pathsList.find(p => p.name === notesPathName);
                                if (pathRow) {
                                  fetch(GOOGLE_SCRIPT_URL, {
                                    method: 'POST',
                                    mode: 'no-cors',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      action: 'updatePathCategory',
                                      pathId: pathRow.id,
                                      pathName: notesPathName,
                                      category: saveCategory,
                                      subcategory: saveSubcategory,
                                      subsubcategory: saveSubsubcategory,
                                    }),
                                  });
                                  // Update local state
                                  setPathsList(prev => prev.map(p => 
                                    p.name === notesPathName 
                                      ? { ...p, category: saveCategory || undefined, subcategory: saveSubcategory || undefined, subsubcategory: saveSubsubcategory || undefined }
                                      : p
                                  ));
                                }
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              fontSize: '10px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              background: 'white',
                              color: '#334155',
                              boxSizing: 'border-box',
                            }}
                          />
                          <datalist id="panel-subsubcategory-list">
                            {getSubsubcategories(pathsList, saveCategory, saveSubcategory).map(subsub => (
                              <option key={subsub} value={subsub} />
                            ))}
                          </datalist>
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Path name input */}
                {manualHighlights.size > 0 && (
                  <input
                    type="text"
                    placeholder="Enter path name..."
                    value={pathName}
                    onChange={(e) => setPathName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      marginBottom: '8px',
                      fontSize: '11px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: 'white',
                      color: '#334155',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
                
                {/* Button row */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {/* Save Path button */}
                  {manualHighlights.size > 0 && (() => {
                    const pathExists = pathsList.some(p => p.name === pathName.trim());
                    const isDisabled = saveStatus === 'saving' || !pathName.trim() || pathExists;
                    return (
                      <button
                        onClick={savePath}
                        disabled={isDisabled}
                        style={{
                          flex: 1,
                          minWidth: '80px',
                          padding: '8px 12px',
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
                          borderRadius: '8px',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontSize: '10px',
                          fontWeight: '600',
                          opacity: !pathName.trim() ? 0.6 : 1,
                        }}
                      >
                        {saveStatus === 'saving' ? '⏳...' 
                          : saveStatus === 'success' ? '✓' 
                          : saveStatus === 'error' ? '✕' 
                          : pathExists ? '✓ Exists'
                          : '💾 Save'}
                      </button>
                    );
                  })()}
                  
                  {/* Delete Path button */}
                  {activePath && (
                    <button
                      onClick={deletePath}
                      style={{
                        flex: 1,
                        minWidth: '80px',
                        padding: '8px 12px',
                        background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                        color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.3)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: '600',
                      }}
                    >
                      🗑 Delete
                    </button>
                  )}
                  
                  {/* Export PDF button */}
                  <button
                    onClick={exportToPDF}
                    style={{
                      flex: 1,
                      minWidth: '80px',
                      padding: '8px 12px',
                      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}
                  >
                    ↓ PDF
                  </button>
                </div>
              </div>
              
              {/* Node notes section - LAST */}
              <div>
                <div style={{ 
                  fontSize: '10px', 
                  fontWeight: '600', 
                  color: '#64748b',
                  marginBottom: '8px',
                }}>
                  📝 Node Notes
                </div>
                <div style={{ maxHeight: notesPanelSize.height - 300, overflowY: 'auto' }}>
                {(() => {
                  // Sort nodes by hierarchy depth (parents first)
                  const getNodeDepth = (nodeId: string, visited = new Set<string>()): number => {
                    if (visited.has(nodeId)) return 0;
                    visited.add(nodeId);
                    const parentEdges = edges.filter(e => e.target === nodeId);
                    if (parentEdges.length === 0) return 0;
                    return Math.max(...parentEdges.map(e => getNodeDepth(e.source, visited))) + 1;
                  };
                  
                  const sortedNodeIds = Array.from(manualHighlights).sort((a, b) => {
                    return getNodeDepth(a) - getNodeDepth(b);
                  });
                  
                  if (sortedNodeIds.length === 0) {
                    return (
                      <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                        No nodes in this path
                      </div>
                    );
                  }
                  
                  const currentPathIdForPanel = activePathId || tempPathId;
                  
                  return sortedNodeIds.map((nodeId) => {
                    const node = nodes.find(n => n.id === nodeId);
                    const nodeData = node?.data as NodeData | undefined;
                    const content = sidebarNodeContent[nodeId] ?? (currentPathIdForPanel ? nodePathMap[currentPathIdForPanel]?.[nodeId] || '' : '');
                    
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
                          onMouseDown={(e) => e.stopPropagation()}
                          onWheelCapture={(e) => {
                            // Stop the wheel event from reaching ReactFlow
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                          }}
                          onChange={(e) => {
                            const newContent = e.target.value;
                            setSidebarNodeContent(prev => ({ ...prev, [nodeId]: newContent }));
                            
                            if (currentPathIdForPanel) {
                              setNodePathMap(prev => ({
                                ...prev,
                                [currentPathIdForPanel]: {
                                  ...(prev[currentPathIdForPanel] || {}),
                                  [nodeId]: newContent,
                                },
                              }));
                              // Update last updated timestamp
                              setPathLastUpdated(prev => ({ ...prev, [currentPathIdForPanel]: Date.now() }));
                            }
                            
                            // Auto-resize
                            const textarea = e.target;
                            textarea.style.height = 'auto';
                            const maxHeight = 225;
                            textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                            
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
                                    pathId: currentPathIdForPanel,
                                    nodeId: nodeId,
                                    content: newContent,
                                  }),
                                });
                              } catch (error) {
                                console.error('Error saving node content:', error);
                              }
                            }, 1000);
                          }}
                          onFocus={(e) => {
                            // Auto-resize on focus
                            const textarea = e.target;
                            textarea.style.height = 'auto';
                            const maxHeight = 225;
                            textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                          }}
                          style={{
                            width: '100%',
                            minHeight: '50px',
                            maxHeight: '225px',
                            padding: '8px 10px',
                            fontSize: '11px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            background: 'white',
                            color: '#334155',
                            resize: 'both',
                            fontFamily: 'inherit',
                            lineHeight: 1.4,
                            boxSizing: 'border-box',
                            overflow: 'auto',
                          }}
                        />
                      </div>
                    );
                  });
                })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedNode && selectedNodeData && (
  <div
    style={{
      position: 'absolute',
      left: infoPanelPos.x,
      top: infoPanelPos.y,
      zIndex: 10,
      background: 'rgba(255,255,255,0.96)',
      padding: '20px',
      borderRadius: '14px',
      width: infoPanelSize.width,
      height: infoPanelSize.height,
      overflowY: 'auto',
      boxShadow: '0 22px 48px rgba(15,23,42,0.2)',
      border: '1px solid rgba(26,115,232,0.22)',
      color: '#333',
    }}
  >
    {/* Drag handle */}
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        setIsDraggingPanel('info');
        setDragOffset({ x: e.clientX - infoPanelPos.x, y: e.clientY - infoPanelPos.y });
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '28px',
        cursor: 'move',
        background: 'linear-gradient(180deg, rgba(241,245,249,0.8) 0%, transparent 100%)',
        borderTopLeftRadius: '14px',
        borderTopRightRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ 
        width: '40px', 
        height: '4px', 
        background: '#cbd5e1', 
        borderRadius: '2px',
      }} />
    </div>
    
    {/* Edge resize handles */}
    {/* North edge */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'n' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
    {/* South edge */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 's' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
    {/* West edge */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'w' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, left: 0, width: 6, cursor: 'ew-resize' }} />
    {/* East edge */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'e' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, right: 0, width: 6, cursor: 'ew-resize' }} />
    {/* NW corner */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'nw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
    {/* NE corner */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'ne' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
    {/* SW corner */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'sw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
    {/* SE corner */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'se' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
    
    {/* Content with padding for drag handle */}
    <div style={{ marginTop: '10px' }}>
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
            onMouseDown={(e) => e.stopPropagation()}
            onWheelCapture={(e) => {
              // Stop the wheel event from reaching ReactFlow
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
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
              
              // Update last updated timestamp
              setPathLastUpdated(prev => ({ ...prev, [activePathId]: Date.now() }));
              
              // Auto-resize
              const textarea = e.target;
              textarea.style.height = 'auto';
              const maxHeight = 225;
              textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
              
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
            onFocus={(e) => {
              // Auto-resize on focus
              const textarea = e.target;
              textarea.style.height = 'auto';
              const maxHeight = 225;
              textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
            }}
            style={{
              width: '100%',
              minHeight: '80px',
              maxHeight: '225px',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: 'white',
              color: '#334155',
              resize: 'both',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              boxSizing: 'border-box',
              overflow: 'auto',
            }}
          />
        </div>
      );
    })()}
    </div>
  </div>
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