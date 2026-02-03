// Utility: Build a nested tree from flat categories list
export interface CategoryTreeNode extends CategoryRecord {
  children: CategoryTreeNode[];
}

function buildCategoryTree(categories: CategoryRecord[]): CategoryTreeNode[] {
  const nodes: Record<string, CategoryTreeNode> = {};
  const roots: CategoryTreeNode[] = [];
  // Create all nodes
  categories.forEach(cat => {
    nodes[cat.notionPageId || cat.id] = { ...cat, children: [] };
  });
  // Assign children to parents
  Object.values(nodes).forEach(node => {
    if (node.parentId && nodes[node.parentId]) {
      nodes[node.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}
import dagre from 'dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

// Import Notion service
import {
  DATA_SOURCE,
  notionService,
  addSyncStatusListener,
  type SyncStatus,
  type PathRecord,
  type CategoryRecord,
} from './services/notion';

// Import FolderTree component for unified folder/path navigation
import { FolderTree, UnassignedPathsSection, type FolderTreeNode, type PathItem } from './components/FolderTree';

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
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
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

// ============================================
// Rich Text Helper Functions
// ============================================

// Convert HTML back to plain text with markdown-like syntax (for saving)
// Note: Using globalThis.Node to avoid conflict with ReactFlow's Node type
export function htmlToText(html: string): string {
  if (!html) return '';
  
  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Walk through and convert
  function processNode(node: globalThis.Node): string {
    if (node.nodeType === globalThis.Node.TEXT_NODE) {
      return node.textContent || '';
    }
    
    if (node.nodeType === globalThis.Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const children = Array.from(el.childNodes).map((child: globalThis.Node) => processNode(child)).join('');
      
      switch (tag) {
        case 'strong':
        case 'b':
          return `**${children}**`;
        case 'em':
        case 'i':
          return `_${children}_`;
        case 'u':
          return `~~${children}~~`;
        case 's':
        case 'strike':
          return `--${children}--`;
        case 'a':
          return `[${children}](${el.getAttribute('href') || ''})`;
        case 'mark':
          return `==${children}==`;
        case 'br':
          return '\n';
        case 'div':
        case 'p':
          return children + '\n';
        default:
          return children;
      }
    }
    
    return '';
  }
  
  let text = processNode(temp as globalThis.Node);
  // Clean up extra newlines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// ============================================
// End Rich Text Helpers
// ============================================

function MethodNode(props: any) {
  const data = props.data as NodeData & { 
    isHighlighted?: boolean; 
    onInfoClick?: (nodeId: string) => void;
    onToggleSelect?: (nodeId: string) => void;
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

  // "i" button now toggles selection (like clicking the node)
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onToggleSelect) {
      data.onToggleSelect(props.id);
    }
  };

  // Clicking the title opens the popup
  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Get first line for preview - strip HTML and get plain text
  const getPlainTextPreview = (html: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    // Get first line, trim and limit length
    const firstLine = text.split(/[\n\r]/).find(line => line.trim()) || '';
    return firstLine.trim().substring(0, 50) + (firstLine.length > 50 ? '...' : '');
  };
  const firstLine = getPlainTextPreview(data.nodeNote || '');
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
      {/* Toggle selection button (was "i" info button) */}
      <button
        onClick={handleToggleClick}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: 'none',
          background: isHighlighted ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.08)',
          color: isHighlighted ? '#3b82f6' : '#64748b',
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
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
          e.currentTarget.style.color = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isHighlighted ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.08)';
          e.currentTarget.style.color = isHighlighted ? '#3b82f6' : '#64748b';
        }}
        title={isHighlighted ? 'Deselect node' : 'Select node'}
      >
        {isHighlighted ? '✓' : '○'}
      </button>
      {/* Clickable title - opens popup */}
      <div 
        onClick={handleTitleClick}
        style={{ 
          fontWeight: 600, 
          fontSize: 12, 
          marginBottom: 3, 
          textAlign: 'center', 
          cursor: 'pointer',
          borderRadius: 4,
          padding: '2px 4px',
          marginRight: 20,
          marginLeft: -4,
          marginTop: -2,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Click to open notes editor"
      >
        {data.label}
      </div>
      
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

const nodeTypes = { method: MethodNode, personalizedNode: PersonalizedNode };

type PathRow = {
  id: string;
  name: string;
  nodeIds: string[];
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  notes?: string;
  status?: string;
  dateUpdated?: string;
  lastUpdated?: number; // timestamp for sorting by latest activity
  priority?: number; // 0-100, higher = more important (red), lower = less important (blue)
};

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
  const [, setPathName] = useState('');
  const [, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [sidebarNodeContent, setSidebarNodeContent] = useState<Record<string, string>>({});
  
  // Categories loaded from Notion (used as folders)
  const [categoriesList, setCategoriesList] = useState<CategoryRecord[]>([]);

  // Build the nested folder tree for rendering
  const folderTree: FolderTreeNode[] = useMemo(() => buildCategoryTree(categoriesList) as FolderTreeNode[], [categoriesList]);

  // Folder tree expansion state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  // Toggle folder expand/collapse
  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: prev[folderId] === false ? true : false }));
  }, []);
  
  // Notion sync status (prefixed with _ since we're setting up the listener but UI not implemented yet)
  const [_syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [_syncMessage, setSyncMessage] = useState<string | undefined>();
  
  // Node filter state for filtering paths by node
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string | null>(null);
  const [selectedNodeFilterLabel, setSelectedNodeFilterLabel] = useState<string>('');
  
  // Combined search state (paths + nodes autocomplete)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchFocusIndex, setSearchFocusIndex] = useState(-1);
  
  // All loaded nodes for autocomplete (stored when data loads)
  const [allNodesData, setAllNodesData] = useState<Array<{ id: string; label: string }>>([]);
  
  // View mode: 'folder' (default, shows nested folders), 'alpha' (A-Z list), 'latest' (by last updated), 'priority' (by priority)
  const [viewMode, setViewMode] = useState<'folder' | 'alpha' | 'latest' | 'priority'>('folder');
  
  // Track last updated timestamps for each path (pathId -> timestamp)
  const [pathLastUpdated, setPathLastUpdated] = useState<Record<string, number>>({});
  
  // Panel position and size state for draggable/resizable panels
  const [leftPanelPos, setLeftPanelPos] = useState({ x: 20, y: 20 });
  const [leftPanelSize, setLeftPanelSize] = useState({ width: 260, height: 600 });
  const [notesPathName, setNotesPathName] = useState<string | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState<'left' | 'info' | null>(null);
  const [resizeEdge, setResizeEdge] = useState<{ panel: 'left' | 'info'; edge: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, width: 0, height: 0, x: 0, y: 0 });
  
  // Inline note editing state
  const [editingNoteNodeId, setEditingNoteNodeId] = useState<string | null>(null);
  
  // Path-level notes state
  const [pathNotes, setPathNotes] = useState<Record<string, string>>({}); // pathId -> notes
  
  // Track newly created path for auto-edit mode
  const [autoEditPathId, setAutoEditPathId] = useState<string | null>(null);
  
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const editorFocusModeRef = useRef<HTMLDivElement>(null);
  
  // Subscribe to sync status updates from Notion service
  useEffect(() => {
    const unsubscribe = addSyncStatusListener((status, message) => {
      setSyncStatus(status);
      setSyncMessage(message);
    });
    return unsubscribe;
  }, []);
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const activePathIdRef = useRef<string | null>(null);
  const activePathRef = useRef<string | null>(null);
  const [noteSaveStatus, setNoteSaveStatus] = useState<Record<string, 'saved' | 'saving'>>({});
  
  // Advanced editor features
  const [editorFocusMode, setEditorFocusMode] = useState(false);
  const [sidebarFocusMode, setSidebarFocusMode] = useState(false);
  const [pathNotesFocusMode, setPathNotesFocusMode] = useState(false); // Focus mode for path notes
  const wysiwygEditorRef = useRef<HTMLDivElement | null>(null);
  const focusModeEditorRef = useRef<HTMLDivElement | null>(null);
  const focusModeInitialized = useRef(false); // Track if focus mode editor has been initialized
  const mainEditorInitialized = useRef<string | null>(null); // Track which node's content is loaded in main editor
  const updatePathNodesCallbackRef = useRef<((pathId: string, pathName: string, nodeIds: Set<string>) => void) | null>(null);
  const [highlightedFolderId, setHighlightedFolderId] = useState<string | null>(null);
  
  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as HTMLElement)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close panels when clicking outside
  useEffect(() => {
    const handleOutsidePanels = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Don't close selectedNode when in editor focus mode
      if (selectedNode && infoPanelRef.current && !infoPanelRef.current.contains(target)) {
        // Check if click is inside focus mode overlay
        if (editorFocusModeRef.current && editorFocusModeRef.current.contains(target)) {
          return; // Don't close when clicking inside focus mode
        }
        setSelectedNode(null);
      }
    };
    document.addEventListener('mousedown', handleOutsidePanels);
    return () => document.removeEventListener('mousedown', handleOutsidePanels);
  }, [selectedNode]);
  
  // Keep ref in sync with state
  useEffect(() => {
    activePathIdRef.current = activePathId;
  }, [activePathId]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // Initialize focus mode editor content when it opens
  useEffect(() => {
    if (editorFocusMode && selectedNode && activePathId && focusModeEditorRef.current) {
      const nodeId = selectedNode.id.replace('personalized-', '');
      const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
      // Only set content if not already initialized for this session
      if (!focusModeInitialized.current) {
        focusModeEditorRef.current.innerHTML = content || '';
        focusModeInitialized.current = true;
      }
    }
    // Reset initialized flag when focus mode closes
    if (!editorFocusMode) {
      focusModeInitialized.current = false;
      // Also reset main editor so it reloads content when focus mode exits
      mainEditorInitialized.current = null;
    }
  }, [editorFocusMode, selectedNode, activePathId]);

  // Initialize main WYSIWYG editor content when popup opens, node changes, or focus mode exits
  useEffect(() => {
    // Only update when not in focus mode (so we refresh content after exiting focus mode)
    if (selectedNode && activePathId && wysiwygEditorRef.current && !editorFocusMode) {
      const nodeId = selectedNode.id.replace('personalized-', '');
      const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
      // Only set content if we're loading a different node OR if mainEditorInitialized is null (coming back from focus mode)
      if (mainEditorInitialized.current !== nodeId || mainEditorInitialized.current === null) {
        wysiwygEditorRef.current.innerHTML = content || '';
        mainEditorInitialized.current = nodeId;
      }
    }
    // Reset when popup closes
    if (!selectedNode) {
      mainEditorInitialized.current = null;
    }
  }, [selectedNode, activePathId, editorFocusMode, sidebarNodeContent, nodePathMap]);

  // Panel drag and resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPanel === 'left') {
        setLeftPanelPos({
          x: Math.max(0, e.clientX - dragOffset.x),
          y: Math.max(0, e.clientY - dragOffset.y),
        });
      }
      
      if (resizeEdge) {
        const { panel, edge } = resizeEdge;
        if (panel !== 'left') return; // Only handle left panel
        
        const deltaX = e.clientX - resizeStart.mouseX;
        const deltaY = e.clientY - resizeStart.mouseY;
        
        const minW = 180;
        const minH = 200;
        
        if (edge.includes('e')) {
          setLeftPanelSize((prev: { width: number; height: number }) => ({ ...prev, width: Math.max(minW, resizeStart.width + deltaX) }));
        }
        if (edge.includes('w')) {
          const newWidth = Math.max(minW, resizeStart.width - deltaX);
          const newX = resizeStart.x + (resizeStart.width - newWidth);
          setLeftPanelSize((prev: { width: number; height: number }) => ({ ...prev, width: newWidth }));
          setLeftPanelPos((prev: { x: number; y: number }) => ({ ...prev, x: Math.max(0, newX) }));
        }
        if (edge.includes('s')) {
          setLeftPanelSize((prev: { width: number; height: number }) => ({ ...prev, height: Math.max(minH, resizeStart.height + deltaY) }));
        }
        if (edge.includes('n')) {
          const newHeight = Math.max(minH, resizeStart.height - deltaY);
          const newY = resizeStart.y + (resizeStart.height - newHeight);
          setLeftPanelSize((prev: { width: number; height: number }) => ({ ...prev, height: newHeight }));
          setLeftPanelPos((prev: { x: number; y: number }) => ({ ...prev, y: Math.max(0, newY) }));
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

  // Handler for info button click - opens focus mode directly
  const handleInfoClick = useCallback((nodeId: string) => {
    const currentNodes = nodesRef.current;
    const node = currentNodes.find(n => n.id === nodeId || n.id === `personalized-${nodeId}` || nodeId === `personalized-${n.id}`);
    if (node) {
      setSelectedNode(node);
      setEditorFocusMode(true);
    } else {
      // Try to find by stripping personalized- prefix
      const cleanId = nodeId.replace('personalized-', '');
      const foundNode = currentNodes.find(n => n.id === cleanId || n.id === nodeId);
      if (foundNode) {
        setSelectedNode(foundNode);
        setEditorFocusMode(true);
      }
    }
  }, []); // Empty deps - uses ref instead

  // Handler for toggle select button - toggles node selection without opening popup
  const handleToggleSelect = useCallback((nodeId: string) => {
    // Skip personalized nodes
    if (nodeId.startsWith('personalized-')) return;
    
    setManualHighlights((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      // Update visual state (without enforceRootHidden since it's not available yet)
      setNodes((nds) =>
        nds.map((n) => {
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
      
      // Auto-save to backend for the active path (use refs to get current values)
      const currentActivePath = activePathRef.current;
      const currentActivePathId = activePathIdRef.current;
      if (currentActivePath && currentActivePathId) {
        setPathLastUpdated(prevUpdated => ({ ...prevUpdated, [currentActivePathId]: Date.now() }));
        // Use setTimeout to ensure state is updated before saving
        setTimeout(() => {
          if (updatePathNodesCallbackRef.current) {
            updatePathNodesCallbackRef.current(currentActivePathId, currentActivePath, next);
          }
        }, 0);
      }
      
      return next;
    });
  }, []); // Empty deps - uses refs for current values

  // Stable callbacks for inline note editing (use refs to avoid recreating)
  const handleStartEditNote = useCallback((nodeId: string) => {
    if (!activePathId) return;
    setEditingNoteNodeId(nodeId);
  }, [activePathId]);

  const handleStopEditNote = useCallback(() => {
    setEditingNoteNodeId(null);
  }, []);

  const handleNodeNoteChange = useCallback((nodeId: string, note: string) => {
    if (!activePathId) return;
    handleInlineNoteChangeRef.current(nodeId, note);
  }, [activePathId]);

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

  // Handler for path-level notes with debounced auto-save
  const handlePathNotesChange = useCallback(async (notes: string) => {
    const pathIdToUse = activePathId;
    if (!pathIdToUse) return;
    
    // Update local state
    setPathNotes(prev => ({ ...prev, [pathIdToUse!]: notes }));
    
    // Update last updated timestamp
    setPathLastUpdated(prev => ({ ...prev, [pathIdToUse!]: Date.now() }));
    
    // Set status to saving
    setNoteSaveStatus(prev => ({ ...prev, ['pathNotes']: 'saving' }));
    
    // Debounced auto-save
    if (debounceTimerRef.current['pathNotes']) {
      clearTimeout(debounceTimerRef.current['pathNotes']);
    }
    debounceTimerRef.current['pathNotes'] = setTimeout(async () => {
      try {
        if (DATA_SOURCE === 'notion') {
          // Save to Notion
          await notionService.savePathNotes(pathIdToUse!, notes);
        } else {
          // Legacy: Save to Google Sheets
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
        }
        // Set status to saved
        setNoteSaveStatus(prev => ({ ...prev, ['pathNotes']: 'saved' }));
      } catch (error) {
        console.error('Error saving path notes:', error);
        // Still mark as saved to avoid stuck "Saving..." state
        setNoteSaveStatus(prev => ({ ...prev, ['pathNotes']: 'saved' }));
      }
    }, 1000);
  }, [activePathId, GOOGLE_SCRIPT_URL]);

  // Handler for inline node note changes with debounced auto-save
  const handleInlineNoteChange = useCallback(async (nodeId: string, note: string) => {
    // Update sidebar content state
    setSidebarNodeContent(prev => ({ ...prev, [nodeId]: note }));
    
    // Determine which path ID to use
    const pathIdToUse = activePathId;
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
        if (DATA_SOURCE === 'notion') {
          // Save to Notion
          await notionService.saveNodePath({
            id: `${pathIdToUse}_${nodeId}`,
            pathId: pathIdToUse!,
            nodeId: nodeId,
            content: note,
          });
        } else {
          // Legacy: Save to Google Sheets
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
        }
      } catch (error) {
        console.error('Error saving inline note:', error);
      }
    }, 1000);
  }, [activePathId, GOOGLE_SCRIPT_URL]);

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
        const noteContent = activePathId
          ? (sidebarNodeContent[n.id] ?? nodePathMap[activePathId]?.[n.id] ?? '')
          : '';
        
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
  }, [editingNoteNodeId, sidebarNodeContent, activePathId, nodePathMap, handleNodeNoteChange, handleStartEditNote, handleStopEditNote, dataLoading]);


  // Rename a path (instant UI update, background save)
  const renamePath = useCallback((oldName: string, newName: string) => {
    if (!oldName || !newName || oldName === newName) return;
    
    const pathRow = pathsList.find(p => p.name === oldName);
    if (!pathRow) return;
    
    // Check if new name already exists
    if (pathsList.some(p => p.name === newName && p.name !== oldName)) {
      console.error('Path name already exists');
      return;
    }
    
    // Immediate UI update (optimistic)
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
    
    // Background save with debounce
    if (debounceTimerRef.current['renamePath']) {
      clearTimeout(debounceTimerRef.current['renamePath']);
    }
    
    debounceTimerRef.current['renamePath'] = setTimeout(async () => {
      try {
        if (DATA_SOURCE === 'notion') {
          await notionService.renamePath(pathRow.id || oldName, newName);
        } else {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'renamePath',
              pathId: pathRow.id || oldName,
              oldName: oldName,
              newName: newName,
            }),
          });
        }
      } catch (error) {
        console.error('Error renaming path:', error);
        // Revert on error
        setPathsList(prev => prev.map(p => 
          p.name === newName ? { ...p, name: oldName } : p
        ));
        setPathsMap(prev => {
          const newMap = { ...prev };
          if (newMap[newName]) {
            newMap[oldName] = newMap[newName];
            delete newMap[newName];
          }
          return newMap;
        });
      }
    }, 500);
  }, [pathsList, activePath, notesPathName, GOOGLE_SCRIPT_URL]);

  const deletePathByName = useCallback(async (pathNameToDelete: string) => {
    const pathRow = pathsList.find(p => p.name === pathNameToDelete);
    if (!pathRow) return;

    if (!confirm(`Are you sure you want to delete the path "${pathNameToDelete}"? This will move it to trash in Notion.`)) {
      return;
    }

    const pathIdToDelete = pathRow.id || pathRow.name;
    setSaveStatus('saving');

    try {
      if (DATA_SOURCE === 'notion') {
        // Delete path and its associated node notes (moves to Notion trash)
        await Promise.all([
          notionService.deletePath(pathIdToDelete),
          notionService.deleteNodePathsForPath(pathIdToDelete),
        ]);
      } else {
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'deletePath',
            pathId: pathIdToDelete,
            pathName: pathRow.name,
          }),
        });
      }

      setSaveStatus('success');
      setPathsList(prev => prev.filter(p => p.name !== pathNameToDelete));
      setPathsMap(prev => {
        const newMap = { ...prev };
        delete newMap[pathNameToDelete];
        return newMap;
      });
      setPathNotes(prev => {
        const next = { ...prev };
        delete next[pathIdToDelete];
        return next;
      });
      setNodePathMap(prev => {
        const next = { ...prev };
        delete next[pathIdToDelete];
        return next;
      });
      setPathLastUpdated(prev => {
        const next = { ...prev };
        delete next[pathIdToDelete];
        return next;
      });

      if (activePath === pathNameToDelete) {
        setActivePath(null);
        setActivePathId(null);
        setSidebarNodeContent({});
        setManualHighlights(new Set());
        setNodes((nds) =>
          enforceRootHidden(nds).map((n) => ({
            ...n,
            data: { ...n.data, isHighlighted: false },
          }))
        );
      }
      if (notesPathName === pathNameToDelete) {
        setPathNotesFocusMode(false);
        setNotesPathName(null);
      }

      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error deleting path:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [pathsList, activePath, notesPathName, GOOGLE_SCRIPT_URL]);

  // Update path category/folder (for drag and drop)
  const updatePathCategory = async (pathName: string, newCategory: string, newSubcategory?: string) => {
    const pathRow = pathsList.find(p => p.name === pathName);
    if (!pathRow) return;

    try {
      if (DATA_SOURCE === 'notion') {
        await notionService.updatePathCategory(
          pathRow.id || pathName,
          newCategory,
          newSubcategory || '',
          '' // subsubcategory
        );
      } else {
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
      }

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

  // Debounce ref for priority updates
  const priorityUpdateRef = useRef<NodeJS.Timeout | null>(null);

  // Update path priority
  const updatePathPriorityHandler = async (pathId: string, newPriority: number) => {
    // Update local state immediately for responsive UI
    setPathsList(prev => prev.map(p => 
      p.id === pathId ? { ...p, priority: newPriority } : p
    ));
    
    // Debounce the backend save to avoid flooding the API
    if (priorityUpdateRef.current) {
      clearTimeout(priorityUpdateRef.current);
    }
    
    priorityUpdateRef.current = setTimeout(async () => {
      try {
        if (DATA_SOURCE === 'notion') {
          console.log('Saving priority to Notion:', { pathId, newPriority });
          await notionService.updatePathPriority(pathId, newPriority);
          console.log('Priority saved successfully');
        }
      } catch (error) {
        console.error('Error updating path priority:', error);
      }
    }, 500); // Wait 500ms after user stops dragging
  };

  // Create a new folder (category) with optional parent
  const handleCreateFolder = async (name: string, parentId: string | null): Promise<void> => {
    console.log('handleCreateFolder called:', { name, parentId });
    console.log('Existing categories:', categoriesList.map(c => c.name));
    
    // Check if this folder name already exists
    if (categoriesList.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      console.log('Folder already exists:', name);
      alert(`A folder named "${name}" already exists.`);
      return;
    }

    try {
      if (DATA_SOURCE === 'notion') {
        console.log('Creating category in Notion...');
        const newCategory = await notionService.createCategory(name, parentId);
        console.log('Category created:', newCategory);
        setCategoriesList(prev => [...prev, newCategory]);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert(`Error creating folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Delete a folder (category)
  const handleDeleteFolder = async (folder: FolderTreeNode): Promise<void> => {
    if (!window.confirm(`Delete folder "${folder.name}"? Paths inside will become unfiled.`)) return;
    
    try {
      if (DATA_SOURCE === 'notion' && folder.notionPageId) {
        await notionService.deleteCategory(folder.notionPageId);
        setCategoriesList(prev => prev.filter(c => c.id !== folder.id && c.notionPageId !== folder.notionPageId));
        // Move any paths in this folder to unfiled
        setPathsList(prev => prev.map(p => 
          p.category === folder.id ? { ...p, category: undefined } : p
        ));
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  // Rename a folder
  const handleRenameFolder = async (folder: FolderTreeNode, newName: string): Promise<void> => {
    try {
      if (DATA_SOURCE === 'notion' && folder.notionPageId) {
        await notionService.updateCategory(folder.notionPageId, { name: newName });
        setCategoriesList(prev => prev.map(c => 
          c.id === folder.id || c.notionPageId === folder.notionPageId
            ? { ...c, name: newName }
            : c
        ));
      }
    } catch (error) {
      console.error('Error renaming folder:', error);
    }
  };

  // Move path to folder
  const handleMovePathToFolder = async (pathName: string, folderId: string | null): Promise<void> => {
    await updatePathCategory(pathName, folderId || '');
  };

  // Move folder to another folder (nest)
  const handleMoveFolderToFolder = async (folderId: string, targetParentId: string | null): Promise<void> => {
    console.log('handleMoveFolderToFolder called:', { folderId, targetParentId });
    
    // Find the folder being moved (by custom ID or notionPageId)
    const folder = categoriesList.find(c => c.id === folderId || c.notionPageId === folderId);
    if (!folder) {
      console.error('Could not find folder to move:', folderId);
      return;
    }

    // Prevent moving a folder into itself
    if (folderId === targetParentId || folder.notionPageId === targetParentId) {
      console.log('Cannot move folder into itself');
      return;
    }

    // If targetParentId is provided, find the target folder to get its notionPageId
    let targetNotionPageId: string | null = null;
    if (targetParentId) {
      const targetFolder = categoriesList.find(c => 
        c.id === targetParentId || c.notionPageId === targetParentId
      );
      if (targetFolder) {
        targetNotionPageId = targetFolder.notionPageId || null;
      } else {
        console.error('Could not find target folder:', targetParentId);
        return;
      }
    }

    try {
      if (DATA_SOURCE === 'notion' && folder.notionPageId) {
        console.log('Moving folder', folder.name, 'to parent notionPageId:', targetNotionPageId);
        await notionService.updateCategory(folder.notionPageId, { parentId: targetNotionPageId });
        setCategoriesList(prev => prev.map(c =>
          c.id === folder.id || c.notionPageId === folder.notionPageId
            ? { ...c, parentId: targetNotionPageId }
            : c
        ));
        console.log('Folder moved successfully');
      }
    } catch (error) {
      console.error('Error moving folder:', error);
      alert(`Error moving folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Convert paths list to PathItem format for FolderTree
  const folderPathItems: PathItem[] = useMemo(() => 
    pathsList
      .filter(p => p.name) // Filter out empty names
      .map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priority: p.priority,
      })),
    [pathsList]
  );

  // Sorted paths for alpha view (A-Z by name)
  const alphaSortedPaths: PathItem[] = useMemo(() => {
    const filtered = selectedNodeFilter
      ? folderPathItems.filter(p => {
          const pathRow = pathsList.find(pr => pr.id === p.id);
          return pathRow?.nodeIds?.includes(selectedNodeFilter);
        })
      : folderPathItems;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [folderPathItems, pathsList, selectedNodeFilter]);

  // Sorted paths for latest view (by last updated timestamp)
  const latestSortedPaths: PathItem[] = useMemo(() => {
    const filtered = selectedNodeFilter
      ? folderPathItems.filter(p => {
          const pathRow = pathsList.find(pr => pr.id === p.id);
          return pathRow?.nodeIds?.includes(selectedNodeFilter);
        })
      : folderPathItems;
    return [...filtered].sort((a, b) => {
      const aTime = pathLastUpdated[a.id] || 0;
      const bTime = pathLastUpdated[b.id] || 0;
      return bTime - aTime; // Most recent first
    });
  }, [folderPathItems, pathLastUpdated, pathsList, selectedNodeFilter]);

  // Sorted paths for priority view (by priority, highest first)
  const prioritySortedPaths: PathItem[] = useMemo(() => {
    const filtered = selectedNodeFilter
      ? folderPathItems.filter(p => {
          const pathRow = pathsList.find(pr => pr.id === p.id);
          return pathRow?.nodeIds?.includes(selectedNodeFilter);
        })
      : folderPathItems;
    return [...filtered].sort((a, b) => {
      const aPriority = a.priority ?? 50; // Default to 50
      const bPriority = b.priority ?? 50;
      return bPriority - aPriority; // Highest priority first
    });
  }, [folderPathItems, pathsList, selectedNodeFilter]);

  // Search results for autocomplete
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { paths: [], nodes: [], folders: [] };
    
    const query = searchQuery.toLowerCase().trim();
    
    // Search paths
    const matchingPaths = folderPathItems.filter(p => 
      p.name.toLowerCase().includes(query)
    ).slice(0, 5);
    
    // Search nodes - also count how many paths contain each node
    const matchingNodes = allNodesData.filter(n =>
      n.label.toLowerCase().includes(query) || n.id.toLowerCase().includes(query)
    ).slice(0, 5).map(node => ({
      ...node,
      pathCount: pathsList.filter(p => p.nodeIds.includes(node.id)).length,
    }));
    
    // Search folders
    const matchingFolders = categoriesList.filter(c =>
      c.name.toLowerCase().includes(query)
    ).slice(0, 5);
    
    return { paths: matchingPaths, nodes: matchingNodes, folders: matchingFolders };
  }, [searchQuery, folderPathItems, allNodesData, categoriesList, pathsList]);

  // Helper function to expand a folder and all its parent folders
  const expandFolderWithParents = useCallback((folderId: string) => {
    // Find all parent folders by traversing the categoriesList
    const expandIds: string[] = [];
    
    // Find the folder to expand
    const targetFolder = categoriesList.find(c => c.id === folderId || c.notionPageId === folderId);
    if (!targetFolder) return;
    
    // Add the target folder
    expandIds.push(targetFolder.notionPageId || targetFolder.id);
    
    // Walk up the parent chain
    let currentParentId = targetFolder.parentId;
    while (currentParentId) {
      const parent = categoriesList.find(c => c.notionPageId === currentParentId || c.id === currentParentId);
      if (parent) {
        expandIds.push(parent.notionPageId || parent.id);
        currentParentId = parent.parentId || null;
      } else {
        break;
      }
    }
    
    // Expand all folders in the chain
    setExpandedFolders(prev => {
      const newExpanded = { ...prev };
      expandIds.forEach(id => {
        newExpanded[id] = true;
      });
      return newExpanded;
    });
    
    // Switch to folder view
    setViewMode('folder');
    
    // Highlight the target folder temporarily
    const targetId = targetFolder.notionPageId || targetFolder.id;
    setHighlightedFolderId(targetId);
    
    // Scroll to the folder after a short delay (to allow DOM to update)
    setTimeout(() => {
      const folderElement = document.querySelector(`[data-folder-id="${targetId}"]`);
      if (folderElement) {
        folderElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after 2 seconds
      setTimeout(() => {
        setHighlightedFolderId(null);
      }, 2000);
    }, 100);
  }, [categoriesList]);

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
        let nodesFromSheet: Node[] = [];
        let edgesFromSheet: Edge[] = [];
        let roots: string[] = [];
        
        if (DATA_SOURCE === 'notion') {
          // Load nodes from Notion
          const notionNodes = await notionService.fetchNodes();
          
          // Convert NodeRecord to ReactFlow Node format
          nodesFromSheet = notionNodes.map((n) => ({
            id: n.id,
            type: 'method',
            position: { x: 0, y: 0 },
            data: {
              label: n.label,
              color: n.color || '#3b82f6',
              category: n.category,
              description: n.description,
              details: n.details,
              longDescription: n.longDescription,
              externalLinks: n.externalLinks,
              images: n.images,
              video: n.video,
              hidden_by_default: n.hidden_by_default,
              wikiUrl: n.wikiUrl,
            } as NodeData,
            hidden: n.hidden_by_default,
          }));
          
          // Build edges from parentIds
          edgesFromSheet = notionNodes.flatMap((n) =>
            n.parentIds
              .filter((pid) => pid && notionNodes.some((node) => node.id === pid))
              .map((parentId) => ({
                id: `${parentId}->${n.id}`,
                source: parentId,
                target: n.id,
              }))
          );
          
          // Find root nodes (nodes with no parents or where parent doesn't exist)
          roots = notionNodes
            .filter((n) => n.parentIds.length === 0 || !n.parentIds.some((pid) => notionNodes.some((node) => node.id === pid)))
            .filter((n) => n.hidden_by_default)
            .map((n) => n.id);
        } else {
          // Load from Google Sheet (legacy)
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
          const built = buildFromRows(parsed.data || []);
          nodesFromSheet = built.nodesFromSheet;
          edgesFromSheet = built.edgesFromSheet;
          roots = built.roots;
        }
        
        if (!nodesFromSheet.length) {
          throw new Error('No nodes found');
        }
        const effectiveRoots = roots.length ? roots : nodesFromSheet.slice(0, 1).map((n) => n.id);
        setBaseNodes(nodesFromSheet);
        setBaseEdges(edgesFromSheet);
        setRootIds(effectiveRoots);
        setEdges(edgesFromSheet);
        
        // Store all nodes data for autocomplete search
        const nodesForAutocomplete = nodesFromSheet.map(n => ({
          id: n.id,
          label: (n.data as NodeData).label || n.id,
        }));
        setAllNodesData(nodesForAutocomplete);
        
        // Add callbacks to each node's data
        const nodesWithCallback = nodesFromSheet.map(n => ({
          ...n,
          data: {
            ...n.data,
            onInfoClick: handleInfoClick,
            onToggleSelect: handleToggleSelect,
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
        setDataError(error?.message || 'Failed to load data');
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
        if (DATA_SOURCE === 'notion') {
          // Load from Notion
          const paths = await notionService.fetchPaths();
          const list: PathRow[] = paths
            .filter((p: PathRecord) => p.name && (p.status ? p.status.toLowerCase() !== 'deleted' : true))
            .map((p: PathRecord) => {
              const lastUpdatedValue = p.dateUpdated || p.lastModified || '';
              const parsedLastUpdated = lastUpdatedValue ? Date.parse(lastUpdatedValue) : 0;
              return {
                id: p.id,
                name: p.name,
                nodeIds: p.nodeIds,
                category: p.category,
                subcategory: p.subcategory,
                subsubcategory: p.subsubcategory,
                notes: p.notes,
                status: p.status,
                dateUpdated: p.dateUpdated,
                lastUpdated: Number.isNaN(parsedLastUpdated) ? undefined : parsedLastUpdated,
                priority: p.priority,
              };
            });
          
          const map: Record<string, string[]> = {};
          const notesMap: Record<string, string> = {};
          const updatedMap: Record<string, number> = {};
          list.forEach((row) => {
            map[row.name] = row.nodeIds;
            if (row.notes && row.id) {
              notesMap[row.id] = row.notes;
            }
            if (row.id) {
              const ts = row.lastUpdated ?? 0;
              updatedMap[row.id] = ts;
            }
          });
          setPathsList(list);
          setPathsMap(map);
          setPathNotes(notesMap);
          setPathLastUpdated(updatedMap);
        } else {
          // Load from Google Sheets (legacy)
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
            .filter((row) => row.name && row.nodeIds.length);
          
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
        }
      } catch (error) {
        console.error('Error loading paths:', error);
        setPathsList([]);
        setPathsMap({});
      }
    };

    const loadNodePaths = async () => {
      try {
        if (DATA_SOURCE === 'notion') {
          // Load from Notion
          const nodePaths = await notionService.fetchNodePaths();
          const map = notionService.buildNodePathMap(nodePaths);
          setNodePathMap(map);
        } else {
          // Load from Google Sheets (legacy)
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
        }
      } catch (error) {
        console.error('Error loading node paths:', error);
        setNodePathMap({});
      }
    };

    const loadCategories = async () => {
      console.log('loadCategories called, DATA_SOURCE:', DATA_SOURCE);
      try {
        if (DATA_SOURCE === 'notion') {
          console.log('Fetching categories from Notion...');
          const categories = await notionService.fetchCategories();
          console.log('Loaded categories:', categories);
          setCategoriesList(categories);
        }
      } catch (error) {
        console.error('Error loading categories:', error);
        setCategoriesList([]);
      }
    };

    loadPaths();
    loadNodePaths();
    loadCategories();
  }, []);

  // Auto-save path nodes when they change (for active saved paths)
  const updatePathNodesRef = useRef<NodeJS.Timeout | null>(null);
  
  const updatePathNodes = useCallback(async (pathId: string, pathName: string, nodeIds: Set<string>) => {
    if (!pathId) return;
    
    // Debounce to avoid too many saves on rapid clicking
    if (updatePathNodesRef.current) {
      clearTimeout(updatePathNodesRef.current);
    }
    
    updatePathNodesRef.current = setTimeout(async () => {
      const nodeIdsArray = Array.from(nodeIds);
      
      try {
        if (DATA_SOURCE === 'notion') {
          // Save to Notion
          await notionService.updatePathNodes(pathId, pathName, nodeIdsArray);
        } else {
          // Legacy: Save to Google Sheets
          const nodeIdsStr = formatNodeIdsForSheet(nodeIds);
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
        }
        
        // Update local state
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

  // Keep the ref updated with the latest callback
  useEffect(() => {
    updatePathNodesCallbackRef.current = updatePathNodes;
  }, [updatePathNodes]);

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      // Close any open popup when clicking a node
      setSelectedNode(null);
      
      // Only toggle selection, don't show popup (popup is triggered by info button)
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
        
        // Auto-save node changes for the active path
        if (activePath && activePathId) {
          // Update last updated timestamp
          setPathLastUpdated(prevUpdated => ({ ...prevUpdated, [activePathId]: Date.now() }));
          
          // Use setTimeout to ensure state is updated before saving
          setTimeout(() => {
            updatePathNodes(activePathId, activePath, next);
          }, 0);
        }
        
        return next;
      });
    },
    [setNodes, enforceRootHidden, activePath, activePathId, updatePathNodes]
  );

  const showPath = (pathName: string) => {
    const pathRow = pathsList.find(p => p.name === pathName);
    const pathNodes = pathsMap[pathName] || [];
    if (!pathRow) {
      return;
    }
    setActivePath(pathName);
    // Use id if available, otherwise fallback to name as identifier
    const currentPathId = pathRow.id || pathRow.name;
    setActivePathId(currentPathId);
    setSidebarNodeContent({}); // Reset content when switching paths
    setPathName(pathName); // Populate path name input with loaded path name
    // Reset to only the new path's nodes (don't accumulate between path buttons)
    setManualHighlights(new Set(pathNodes));
    setNodes((nds) => {
      // Update and layout the regular nodes (no path notes node added to diagram)
      const updated = enforceRootHidden(nds)
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

  const createNewPath = useCallback(() => {
    const timestamp = new Date();
    const tempName = `New Path ${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const newId = generatePathId('new-path');
    const updatedAt = new Date().toISOString();

    // Optimistic UI update - add to list immediately
    setPathsList(prev => [...prev, {
      id: newId,
      name: tempName,
      nodeIds: [],
      status: 'active',
      dateUpdated: updatedAt,
      category: undefined,
    }]);
    setPathsMap(prev => ({
      ...prev,
      [tempName]: [],
    }));
    setPathLastUpdated(prev => ({
      ...prev,
      [newId]: Date.now(),
    }));

    setManualHighlights(new Set());
    setSidebarNodeContent({});

    // Show path immediately
    showPath(tempName);
    
    // Trigger auto-edit mode for the new path
    setAutoEditPathId(newId);

    // Save to backend in background
    (async () => {
      try {
        if (DATA_SOURCE === 'notion') {
          await notionService.savePath({
            id: newId,
            name: tempName,
            nodeIds: [],
            dateUpdated: updatedAt,
            category: undefined,
          });
        } else {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'savePath',
              pathId: forceTextForSheet(newId),
              pathName: forceTextForSheet(tempName),
              nodeIds: '',
              category: '',
              subcategory: '',
              subsubcategory: '',
            }),
          });
        }
      } catch (error) {
        console.error('Error saving new path to backend:', error);
      }
    })();
  }, [showPath]);

  const resetView = () => {
    setActivePath(null);
    setActivePathId(null);
    setManualHighlights(new Set());
    setSidebarNodeContent({});
    setPathName(''); // Clear path name input
    
    setNodes((nds) =>
      enforceRootHidden(nds)
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
          {/* App Title with New Path Button */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: '18px', 
              fontWeight: '700', 
              color: '#1e293b',
              letterSpacing: '0.05em',
            }}>
              The Access
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Focus mode button */}
              <button
                onClick={() => setSidebarFocusMode(true)}
                title="Expand path manager"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  fontSize: '14px',
                  background: 'transparent',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#3b82f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </button>
              <button
                onClick={createNewPath}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 3px 8px rgba(37, 99, 235, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.3)';
                }}
                title="Create new path"
              >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                <span>New Path</span>
              </button>
            </div>
          </div>

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

          {/* Advanced Search Box */}
          <div 
            ref={searchRef}
            style={{ 
              position: 'relative', 
              marginBottom: '10px',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              border: showSearchDropdown ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0 10px',
              transition: 'all 0.15s ease',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search paths, nodes, folders..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                  setSearchFocusIndex(-1);
                }}
                onFocus={() => setShowSearchDropdown(true)}
                onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
                onKeyDown={(e) => {
                  const totalResults = searchResults.paths.length + searchResults.nodes.length + searchResults.folders.length;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSearchFocusIndex(prev => Math.min(prev + 1, totalResults - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSearchFocusIndex(prev => Math.max(prev - 1, -1));
                  } else if (e.key === 'Enter' && searchFocusIndex >= 0) {
                    e.preventDefault();
                    let idx = searchFocusIndex;
                    if (idx < searchResults.paths.length) {
                      // Select path
                      showPath(searchResults.paths[idx].name);
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    } else if (idx < searchResults.paths.length + searchResults.nodes.length) {
                      // Select node - filter paths
                      const nodeIdx = idx - searchResults.paths.length;
                      const node = searchResults.nodes[nodeIdx];
                      setSelectedNodeFilter(node.id);
                      setSelectedNodeFilterLabel(node.label);
                      setViewMode('alpha');
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    } else {
                      // Select folder - expand folder and all its parents
                      const folderIdx = idx - searchResults.paths.length - searchResults.nodes.length;
                      const folder = searchResults.folders[folderIdx];
                      expandFolderWithParents(folder.notionPageId || folder.id);
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowSearchDropdown(false);
                    setSearchQuery('');
                  }
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  padding: '9px 8px',
                  fontSize: '11px',
                  color: '#334155',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setShowSearchDropdown(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: '#94a3b8',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search Dropdown */}
            {showSearchDropdown && searchQuery.trim() && (searchResults.paths.length > 0 || searchResults.nodes.length > 0 || searchResults.folders.length > 0) && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: 'white',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(15,23,42,0.15)',
                border: '1px solid #e2e8f0',
                zIndex: 100,
                maxHeight: '300px',
                overflowY: 'auto',
              }}>
                {/* Paths section */}
                {searchResults.paths.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px', fontSize: '9px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9' }}>
                      📄 Paths
                    </div>
                    {searchResults.paths.map((path, idx) => (
                      <div
                        key={path.id}
                        onClick={() => {
                          showPath(path.name);
                          setSearchQuery('');
                          setShowSearchDropdown(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          background: searchFocusIndex === idx ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                          color: searchFocusIndex === idx ? '#1d4ed8' : '#334155',
                          borderBottom: '1px solid #f8fafc',
                        }}
                        onMouseEnter={() => setSearchFocusIndex(idx)}
                      >
                        {path.name}
                      </div>
                    ))}
                  </div>
                )}

                {/* Nodes section */}
                {searchResults.nodes.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px', fontSize: '9px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9' }}>
                      🔷 Nodes (filter paths containing)
                    </div>
                    {searchResults.nodes.map((node, idx) => {
                      const globalIdx = searchResults.paths.length + idx;
                      return (
                        <div
                          key={node.id}
                          onClick={() => {
                            setSelectedNodeFilter(node.id);
                            setSelectedNodeFilterLabel(node.label);
                            setViewMode('alpha');
                            setSearchQuery('');
                            setShowSearchDropdown(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            background: searchFocusIndex === globalIdx ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                            color: searchFocusIndex === globalIdx ? '#1d4ed8' : '#334155',
                            borderBottom: '1px solid #f8fafc',
                          }}
                          onMouseEnter={() => setSearchFocusIndex(globalIdx)}
                        >
                          {node.label}
                          {node.pathCount > 0 && (
                            <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '6px' }}>
                              ({node.pathCount} {node.pathCount === 1 ? 'path' : 'paths'})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Folders section */}
                {searchResults.folders.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px', fontSize: '9px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9' }}>
                      Folders
                    </div>
                    {searchResults.folders.map((folder, idx) => {
                      const globalIdx = searchResults.paths.length + searchResults.nodes.length + idx;
                      return (
                        <div
                          key={folder.id}
                          onClick={() => {
                            expandFolderWithParents(folder.notionPageId || folder.id);
                            setSearchQuery('');
                            setShowSearchDropdown(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            background: searchFocusIndex === globalIdx ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                            color: searchFocusIndex === globalIdx ? '#1d4ed8' : '#334155',
                            borderBottom: '1px solid #f8fafc',
                          }}
                          onMouseEnter={() => setSearchFocusIndex(globalIdx)}
                        >
                          {folder.name}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Node filter indicator */}
          {selectedNodeFilter && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              marginBottom: '10px',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '8px',
              fontSize: '10px',
              color: '#92400e',
            }}>
              <span>Filtering by node:</span>
              <strong>{selectedNodeFilterLabel}</strong>
              <button
                onClick={() => {
                  setSelectedNodeFilter(null);
                  setSelectedNodeFilterLabel('');
                }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#92400e',
                  padding: '2px',
                  lineHeight: 1,
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Clear View Button */}
          <button
            onClick={() => {
              resetView();
              setSelectedNodeFilter(null);
              setSelectedNodeFilterLabel('');
            }}
            style={{
              width: '100%',
              padding: '9px',
              marginBottom: '10px',
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

          {/* View Mode Controls */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px',
            padding: '4px',
            background: '#f1f5f9',
            borderRadius: '10px',
          }}>
            <button
              onClick={() => setViewMode('folder')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '9px',
                fontWeight: viewMode === 'folder' ? '600' : '500',
                background: viewMode === 'folder' ? 'white' : 'transparent',
                color: viewMode === 'folder' ? '#1d4ed8' : '#64748b',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'folder' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              📁 Folders
            </button>
            <button
              onClick={() => setViewMode('alpha')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '9px',
                fontWeight: viewMode === 'alpha' ? '600' : '500',
                background: viewMode === 'alpha' ? 'white' : 'transparent',
                color: viewMode === 'alpha' ? '#1d4ed8' : '#64748b',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'alpha' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              A-Z
            </button>
            <button
              onClick={() => setViewMode('latest')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '9px',
                fontWeight: viewMode === 'latest' ? '600' : '500',
                background: viewMode === 'latest' ? 'white' : 'transparent',
                color: viewMode === 'latest' ? '#1d4ed8' : '#64748b',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'latest' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              ⏱ Latest
            </button>
            <button
              onClick={() => setViewMode('priority')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '9px',
                fontWeight: viewMode === 'priority' ? '600' : '500',
                background: viewMode === 'priority' ? 'white' : 'transparent',
                color: viewMode === 'priority' ? '#1d4ed8' : '#64748b',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'priority' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Priority
            </button>
          </div>
          </div>
          {/* End of sticky header */}

          {/* Scrollable content based on view mode */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Main scrollable area */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
            {viewMode === 'folder' ? (
              /* FolderTree - unified folder/path navigation */
              <FolderTree
                folders={folderTree}
                paths={folderPathItems}
                activePath={activePath}
                expandedFolders={expandedFolders}
                highlightedFolderId={highlightedFolderId}
                onToggleFolder={handleToggleFolder}
                onSelectPath={(pathName) => showPath(pathName)}
                onCreateFolder={handleCreateFolder}
                onDeleteFolder={handleDeleteFolder}
                onRenameFolder={handleRenameFolder}
                onMovePathToFolder={handleMovePathToFolder}
                onMoveFolderToFolder={handleMoveFolderToFolder}
                onDeletePath={(pathName) => deletePathByName(pathName)}
                onRenamePath={renamePath}
                onDoubleClickPath={(pathName) => {
                  if (activePath !== pathName) {
                    showPath(pathName);
                  }
                  setNotesPathName(pathName);
                  setPathNotesFocusMode(true);
                }}
                hideUnassigned={true}
                autoEditPathId={autoEditPathId}
                onAutoEditComplete={() => setAutoEditPathId(null)}
              />
            ) : (
              /* Plain list view for A-Z, Latest, and Priority modes */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {(viewMode === 'alpha' ? alphaSortedPaths : viewMode === 'priority' ? prioritySortedPaths : latestSortedPaths).map((path) => (
                  <div
                    key={path.id}
                    onClick={() => showPath(path.name)}
                    onDoubleClick={() => {
                      if (activePath !== path.name) {
                        showPath(path.name);
                      }
                      setNotesPathName(path.name);
                      setPathNotesFocusMode(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: activePath === path.name 
                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                        : 'transparent',
                      color: activePath === path.name ? '#1d4ed8' : '#334155',
                      border: activePath === path.name 
                        ? '1px solid rgba(59, 130, 246, 0.3)' 
                        : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (activePath !== path.name) {
                        e.currentTarget.style.background = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activePath !== path.name) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {/* Priority indicator dot */}
                    {path.priority !== undefined && (
                      <span 
                        title={`Priority: ${path.priority}`}
                        style={{ 
                          width: '6px', 
                          height: '6px', 
                          borderRadius: '50%', 
                          flexShrink: 0,
                          background: `rgb(${Math.round(239 * (path.priority / 100) + 59 * (1 - path.priority / 100))}, ${Math.round(68 * (path.priority / 100) + 130 * (1 - path.priority / 100))}, ${Math.round(68 * (path.priority / 100) + 246 * (1 - path.priority / 100))})`,
                          boxShadow: `0 0 4px rgba(${Math.round(239 * (path.priority / 100) + 59 * (1 - path.priority / 100))}, ${Math.round(68 * (path.priority / 100) + 130 * (1 - path.priority / 100))}, ${Math.round(68 * (path.priority / 100) + 246 * (1 - path.priority / 100))}, 0.4)`,
                        }} 
                      />
                    )}
                    <span style={{ fontSize: '11px', fontWeight: activePath === path.name ? '600' : '500', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {path.name}
                    </span>
                    {viewMode === 'latest' && pathLastUpdated[path.id] && (
                      <span style={{ fontSize: '9px', color: '#94a3b8', flexShrink: 0 }}>
                        {new Date(pathLastUpdated[path.id]).toLocaleDateString()}
                      </span>
                    )}
                    {viewMode === 'priority' && (
                      <span style={{ 
                        fontSize: '9px', 
                        color: `rgb(${Math.round(239 * ((path.priority ?? 50) / 100) + 59 * (1 - (path.priority ?? 50) / 100))}, ${Math.round(68 * ((path.priority ?? 50) / 100) + 130 * (1 - (path.priority ?? 50) / 100))}, ${Math.round(68 * ((path.priority ?? 50) / 100) + 246 * (1 - (path.priority ?? 50) / 100))})`,
                        fontWeight: 600,
                        flexShrink: 0 
                      }}>
                        {path.priority ?? 50}
                      </span>
                    )}
                  </div>
                ))}
                {(viewMode === 'alpha' ? alphaSortedPaths : viewMode === 'priority' ? prioritySortedPaths : latestSortedPaths).length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                    {selectedNodeFilter ? 'No paths contain this node' : 'No paths found'}
                  </div>
                )}
              </div>
            )}
            </div>
            
            {/* Sticky Unassigned Paths Section (only in folder view) */}
            {viewMode === 'folder' && (
              <UnassignedPathsSection
                paths={folderPathItems}
                activePath={activePath}
                onSelectPath={(pathName) => showPath(pathName)}
                onMovePathToFolder={handleMovePathToFolder}
                onDeletePath={(pathName) => deletePathByName(pathName)}
                onRenamePath={renamePath}
                onDoubleClickPath={(pathName) => {
                  if (activePath !== pathName) {
                    showPath(pathName);
                  }
                  setNotesPathName(pathName);
                  setPathNotesFocusMode(true);
                }}
                autoEditPathId={autoEditPathId}
                onAutoEditComplete={() => setAutoEditPathId(null)}
              />
            )}
          </div>
        </div>
        </div>

      </ReactFlow>
      
      {/* Full-screen Editor Focus Mode Overlay */}
      {editorFocusMode && selectedNode && activePathId && (() => {
        const nodeId = selectedNode.id.replace('personalized-', '');
        const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
        const readingTime = Math.max(1, Math.ceil(wordCount / 200));
        
        return (
          <div
            ref={editorFocusModeRef}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(20px)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditorFocusMode(false);
            }}
          >
            <div
              style={{
                width: '95%',
                maxWidth: '1200px',
                maxHeight: '90vh',
                background: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '20px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Focus mode header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(226,232,240,0.6)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(248,250,252,0.8)',
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: `linear-gradient(135deg, ${selectedNodeData?.color || '#3b82f6'}20 0%, ${selectedNodeData?.color || '#3b82f6'}10 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}>
                  📝
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                    {selectedNodeData?.label || 'Notes'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {wordCount} words · {readingTime} min read
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  color: noteSaveStatus[nodeId] === 'saving' ? '#f59e0b' : '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontWeight: 500,
                  padding: '6px 10px',
                  background: noteSaveStatus[nodeId] === 'saving' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                  borderRadius: '6px',
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: noteSaveStatus[nodeId] === 'saving' ? '#f59e0b' : '#22c55e',
                    animation: noteSaveStatus[nodeId] === 'saving' ? 'pulse 1s ease-in-out infinite' : 'none',
                  }} />
                  {noteSaveStatus[nodeId] === 'saving' ? 'Saving...' : 'Saved'}
                </span>
                <button
                  onClick={() => setEditorFocusMode(false)}
                  title="Close (Esc)"
                  style={{
                    background: 'rgba(100,116,139,0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(100,116,139,0.2)';
                    e.currentTarget.style.color = '#475569';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(100,116,139,0.1)';
                    e.currentTarget.style.color = '#64748b';
                  }}
                >
                  ✕
                </button>
              </div>
              
              {/* Two-column layout */}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left column: Notes editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(226,232,240,0.6)' }}>
                  {/* Focus mode WYSIWYG toolbar */}
                  <div style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(226,232,240,0.6)',
                    display: 'flex',
                    gap: '1px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    background: 'rgba(250,250,250,0.95)',
                  }}>
                    {[
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>, title: 'Bold (⌘B)', command: 'bold' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>, title: 'Italic (⌘I)', command: 'italic' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>, title: 'Underline (⌘U)', command: 'underline' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="12" x2="20" y2="12"/><path d="M6 4h8a4 4 0 0 1 0 8H6z"/></svg>, title: 'Strikethrough', command: 'strikeThrough' },
                      { icon: 'sep' },
                      { icon: 'H1', title: 'Heading 1', command: 'formatBlock', arg: 'h1', style: { fontWeight: 600, fontSize: '11px', fontFamily: 'system-ui' } },
                      { icon: 'H2', title: 'Heading 2', command: 'formatBlock', arg: 'h2', style: { fontWeight: 600, fontSize: '10px', fontFamily: 'system-ui' } },
                      { icon: 'H3', title: 'Heading 3', command: 'formatBlock', arg: 'h3', style: { fontWeight: 500, fontSize: '9px', fontFamily: 'system-ui' } },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>, title: 'Bullet list', command: 'insertUnorderedList' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="8" fontSize="7" fill="currentColor" stroke="none">1</text><text x="3" y="14" fontSize="7" fill="currentColor" stroke="none">2</text><text x="3" y="20" fontSize="7" fill="currentColor" stroke="none">3</text></svg>, title: 'Numbered list', command: 'insertOrderedList' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><line x1="14" y1="6" x2="21" y2="6"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="17" x2="21" y2="17"/></svg>, title: 'Task list', command: 'insertHTML', arg: '<ul style="list-style:none;padding-left:20px"><li>☐ </li></ul>' },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="3" y2="18"/><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>, title: 'Block quote', command: 'formatBlock', arg: 'blockquote' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, title: 'Code block', command: 'formatBlock', arg: 'pre' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>, title: 'Horizontal line', command: 'insertHorizontalRule' },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, title: 'Insert link (⌘K)', command: 'createLink' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, title: 'Insert image', command: 'insertImage' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>, title: 'Embed video', command: 'insertVideo' },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>, title: 'Align left', command: 'justifyLeft' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>, title: 'Align center', command: 'justifyCenter' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>, title: 'Align right', command: 'justifyRight' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>, title: 'Justify', command: 'justifyFull' },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="11 17 6 17 6 3"/><polyline points="2 7 6 3 10 7"/></svg>, title: 'Decrease indent', command: 'outdent' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="13 17 18 17 18 3"/><polyline points="14 7 18 3 22 7"/></svg>, title: 'Increase indent', command: 'indent' },
                      { icon: 'sep' },
                      { icon: 'x²', title: 'Superscript', command: 'superscript', style: { fontSize: '10px', fontFamily: 'system-ui' } },
                      { icon: 'x₂', title: 'Subscript', command: 'subscript', style: { fontSize: '10px', fontFamily: 'system-ui' } },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>, title: 'Text color', command: 'foreColor' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><rect x="2" y="14" width="20" height="6" rx="1" fill="currentColor" opacity="0.3"/></svg>, title: 'Highlight', command: 'hiliteColor' },
                      { icon: 'sep' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>, title: 'Undo (⌘Z)', command: 'undo' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>, title: 'Redo (⌘⇧Z)', command: 'redo' },
                      { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h11M4 12h16M4 17h7"/><line x1="18" y1="12" x2="22" y2="8"/><line x1="18" y1="12" x2="22" y2="16"/></svg>, title: 'Remove formatting', command: 'removeFormat' },
                    ].map((btn, idx) => (
                      btn.icon === 'sep' ? (
                        <div key={idx} style={{ width: '1px', height: '20px', background: 'rgba(203,213,225,0.5)', margin: '0 6px' }} />
                      ) : (
                        <button
                          key={idx}
                          title={btn.title}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const editor = focusModeEditorRef.current;
                            if (editor) {
                              editor.focus();
                              if (btn.command === 'createLink') {
                                const url = prompt('Enter URL:', 'https://');
                                if (url) document.execCommand('createLink', false, url);
                              } else if (btn.command === 'insertImage') {
                                const url = prompt('Enter image URL:', 'https://');
                                if (url) document.execCommand('insertImage', false, url);
                              } else if (btn.command === 'insertVideo') {
                                const url = prompt('Enter YouTube or video URL:', 'https://www.youtube.com/watch?v=');
                                if (url) {
                                  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
                                  if (youtubeMatch) {
                                    const iframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeMatch[1]}" frameborder="0" allowfullscreen style="max-width:100%;border-radius:8px;margin:10px 0;"></iframe>`;
                                    document.execCommand('insertHTML', false, iframe);
                                  } else {
                                    const video = `<video controls src="${url}" style="max-width:100%;border-radius:8px;margin:10px 0;"></video>`;
                                    document.execCommand('insertHTML', false, video);
                                  }
                                }
                              } else if (btn.command === 'foreColor') {
                                const color = prompt('Enter color (hex or name):', '#3b82f6');
                                if (color) document.execCommand('foreColor', false, color);
                              } else if (btn.command === 'hiliteColor') {
                                const color = prompt('Enter highlight color:', '#fef08a');
                                if (color) document.execCommand('hiliteColor', false, color);
                              } else if (btn.arg) {
                                document.execCommand(btn.command!, false, btn.arg);
                              } else {
                                document.execCommand(btn.command!, false);
                              }
                            }
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                            color: '#6b7280',
                            fontSize: '11px',
                            fontWeight: 500,
                            minWidth: '26px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                            ...btn.style,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(59,130,246,0.1)';
                            e.currentTarget.style.color = '#3b82f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#6b7280';
                          }}
                        >
                          {btn.icon}
                        </button>
                      )
                    ))}
                  </div>
              
              {/* Focus mode WYSIWYG editor */}
              <div style={{ flex: 1, padding: '20px', overflow: 'auto', background: 'rgba(248,250,252,0.5)' }}>
                <div
                  ref={focusModeEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Start writing your notes here..."
                  onKeyDown={(e) => {
                    const isMod = e.metaKey || e.ctrlKey;
                    if (e.key === 'Escape') {
                      setEditorFocusMode(false);
                      return;
                    }
                    if (isMod && e.key === 'b') {
                      e.preventDefault();
                      document.execCommand('bold', false);
                    }
                    if (isMod && e.key === 'i') {
                      e.preventDefault();
                      document.execCommand('italic', false);
                    }
                    if (isMod && e.key === 'u') {
                      e.preventDefault();
                      document.execCommand('underline', false);
                    }
                    if (isMod && e.key === 'k') {
                      e.preventDefault();
                      const url = prompt('Enter URL:', 'https://');
                      if (url) document.execCommand('createLink', false, url);
                    }
                  }}
                  onInput={() => {
                    const editor = focusModeEditorRef.current;
                    if (!editor) return;
                    
                    const newContent = editor.innerHTML;
                    
                    setSidebarNodeContent(prev => ({ ...prev, [nodeId]: newContent }));
                    setNodePathMap(prev => ({
                      ...prev,
                      [activePathId]: {
                        ...(prev[activePathId] || {}),
                        [nodeId]: newContent,
                      },
                    }));
                    setPathLastUpdated(prev => ({ ...prev, [activePathId]: Date.now() }));
                    setNoteSaveStatus(prev => ({ ...prev, [nodeId]: 'saving' }));
                    
                    if (debounceTimerRef.current[nodeId]) {
                      clearTimeout(debounceTimerRef.current[nodeId]);
                    }
                    debounceTimerRef.current[nodeId] = setTimeout(async () => {
                      try {
                        if (DATA_SOURCE === 'notion') {
                          await notionService.saveNodePath({
                            id: `${activePathId}_${nodeId}`,
                            pathId: activePathId!,
                            nodeId: nodeId,
                            content: newContent,
                          });
                        } else {
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
                        }
                        setNoteSaveStatus(prev => ({ ...prev, [nodeId]: 'saved' }));
                      } catch (error) {
                        console.error('Error saving node content:', error);
                        setNoteSaveStatus(prev => ({ ...prev, [nodeId]: 'saved' }));
                      }
                    }, 1000);
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(226,232,240,0.8)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '350px',
                    padding: '20px',
                    fontSize: '15px',
                    lineHeight: 1.75,
                    border: '1px solid rgba(226,232,240,0.8)',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.95)',
                    color: '#1e293b',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    boxSizing: 'border-box',
                    outline: 'none',
                    overflow: 'auto',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                />
              </div>
              
              {/* Keyboard shortcuts footer */}
              <div style={{
                padding: '8px 20px',
                borderTop: '1px solid rgba(226,232,240,0.6)',
                background: 'rgba(248,250,252,0.8)',
                display: 'flex',
                gap: '12px',
                fontSize: '10px',
                color: '#64748b',
                flexWrap: 'wrap',
              }}>
                {[
                  { keys: '⌘B', label: 'Bold' },
                  { keys: '⌘I', label: 'Italic' },
                  { keys: '⌘U', label: 'Underline' },
                  { keys: '⌘K', label: 'Link' },
                  { keys: 'Esc', label: 'Close' },
                ].map((s, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ 
                      background: 'rgba(255,255,255,0.9)', 
                      padding: '2px 5px', 
                      borderRadius: '3px',
                      border: '1px solid rgba(226,232,240,0.6)',
                      fontWeight: 500,
                    }}>{s.keys}</span>
                    <span>{s.label}</span>
                  </span>
                ))}
              </div>
                </div>
                
                {/* Right column: Documentation */}
                <div style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(248,250,252,0.6)' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(226,232,240,0.6)',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(248,250,252,0.8)',
                    backdropFilter: 'blur(10px)',
                  }}>
                    <span style={{ fontSize: '14px' }}>📚</span>
                    <span>Documentation</span>
                  </div>
                  <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
                    {/* Long description */}
                    {selectedNodeData?.longDescription && (
                      <div 
                        style={{ 
                          lineHeight: 1.7, 
                          color: '#475569',
                          fontSize: '13px',
                          margin: '0 0 16px',
                          padding: '12px 14px',
                          background: 'rgba(255,255,255,0.9)',
                          borderRadius: '8px',
                          borderLeft: `3px solid ${selectedNodeData.color || '#3b82f6'}`,
                          border: '1px solid rgba(226,232,240,0.6)',
                          borderLeftWidth: '3px',
                          borderLeftColor: selectedNodeData.color || '#3b82f6',
                        }}
                        dangerouslySetInnerHTML={{ __html: selectedNodeData.longDescription }}
                      />
                    )}

                    {/* Images */}
                    {selectedNodeData?.images?.map((img) => (
                      <img
                        key={img.src}
                        src={img.src}
                        alt={img.alt || ''}
                        style={{
                          width: '100%',
                          borderRadius: '8px',
                          marginBottom: '12px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          border: '1px solid rgba(226,232,240,0.6)',
                        }}
                      />
                    ))}

                    {/* Video */}
                    {selectedNodeData?.video && (
                      selectedNodeData.video.type === 'html5' ? (
                        <video
                          controls
                          src={selectedNodeData.video.url}
                          style={{
                            width: '100%',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            border: '1px solid rgba(226,232,240,0.6)',
                          }}
                        />
                      ) : (
                        <iframe
                          src={selectedNodeData.video.url}
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 9',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            border: '1px solid rgba(226,232,240,0.6)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )
                    )}

                    {/* External links */}
                    {(selectedNodeData?.externalLinks?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        {selectedNodeData!.externalLinks!.map((link) => (
                          <a
                            key={link.url}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '10px 14px',
                              marginBottom: '8px',
                              background: 'rgba(255,255,255,0.9)',
                              borderRadius: '8px',
                              color: '#2563eb',
                              fontWeight: 500,
                              fontSize: '13px',
                              textDecoration: 'none',
                              transition: 'all 0.15s ease',
                              border: '1px solid rgba(226,232,240,0.6)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239,246,255,0.9)';
                              e.currentTarget.style.transform = 'translateX(4px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.9)';
                              e.currentTarget.style.transform = 'translateX(0)';
                            }}
                          >
                            <span>🔗</span>
                            <span style={{ flex: 1 }}>{link.label}</span>
                            <span style={{ opacity: 0.6 }}>↗</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Wiki / Documentation button */}
                    {selectedNodeData?.wikiUrl && (
                      <a
                        href={selectedNodeData.wikiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '12px 16px',
                          background: `linear-gradient(135deg, ${selectedNodeData.color || '#3b82f6'} 0%, ${selectedNodeData.color || '#3b82f6'}dd 100%)`,
                          color: 'white',
                          borderRadius: '10px',
                          fontWeight: 600,
                          fontSize: '13px',
                          textDecoration: 'none',
                          boxShadow: `0 4px 14px ${selectedNodeData.color || '#3b82f6'}40`,
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = `0 6px 20px ${selectedNodeData?.color || '#3b82f6'}50`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = `0 4px 14px ${selectedNodeData?.color || '#3b82f6'}40`;
                        }}
                      >
                        <span>📚</span>
                        <span>Open Documentation</span>
                        <span>↗</span>
                      </a>
                    )}
                    
                    {/* No documentation message */}
                    {!selectedNodeData?.longDescription && !selectedNodeData?.images?.length && !selectedNodeData?.video && !selectedNodeData?.externalLinks?.length && !selectedNodeData?.wikiUrl && (
                      <div style={{
                        textAlign: 'center',
                        padding: '32px 16px',
                        color: '#94a3b8',
                        fontSize: '12px',
                        background: 'rgba(248,250,252,0.5)',
                        borderRadius: '8px',
                        border: '1px solid rgba(226,232,240,0.4)',
                      }}>
                        <span style={{ fontSize: '28px', display: 'block', marginBottom: '10px', opacity: 0.4 }}>📄</span>
                        <p style={{ margin: 0 }}>No documentation available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Full-screen Path Notes Focus Mode Overlay */}
      {pathNotesFocusMode && notesPathName && activePathId && (() => {
        const pathContent = pathNotes[activePathId] || '';
        const wordCount = pathContent.trim() ? pathContent.trim().split(/\s+/).length : 0;
        
        // Get all node notes for this path
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
        
        // Priority calculations
        const currentPath = pathsList.find(p => p.id === activePathId);
        const currentPriority = currentPath?.priority ?? 50; // Default to 50 (middle)
        const pathsWithPriority = pathsList.filter(p => p.priority !== undefined);
        const higherPriorityCount = pathsWithPriority.filter(p => (p.priority ?? 50) > currentPriority).length;
        const lowerPriorityCount = pathsWithPriority.filter(p => (p.priority ?? 50) < currentPriority).length;
        const samePriorityCount = pathsWithPriority.filter(p => (p.priority ?? 50) === currentPriority && p.id !== activePathId).length;
        
        // Color interpolation: red (high priority) to blue (low priority)
        const getPriorityColor = (priority: number) => {
          // priority 100 = red, priority 0 = blue
          const r = Math.round(239 * (priority / 100) + 59 * (1 - priority / 100));
          const g = Math.round(68 * (priority / 100) + 130 * (1 - priority / 100));
          const b = Math.round(68 * (priority / 100) + 246 * (1 - priority / 100));
          return `rgb(${r}, ${g}, ${b})`;
        };
        
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(20px)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setPathNotesFocusMode(false);
            }}
          >
            <div
              style={{
                width: '95%',
                maxWidth: '1200px',
                maxHeight: '90vh',
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(20px)',
                borderRadius: '16px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset',
                border: '1px solid rgba(255,255,255,0.3)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(226,232,240,0.6)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(248,250,252,0.8)',
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}>
                  📋
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                    {notesPathName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {wordCount} words · {sortedNodeIds.length} nodes
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  color: noteSaveStatus['pathNotes'] === 'saving' ? '#f59e0b' : '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontWeight: 500,
                  padding: '6px 10px',
                  background: noteSaveStatus['pathNotes'] === 'saving' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                  borderRadius: '6px',
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: noteSaveStatus['pathNotes'] === 'saving' ? '#f59e0b' : '#22c55e',
                    animation: noteSaveStatus['pathNotes'] === 'saving' ? 'pulse 1s ease-in-out infinite' : 'none',
                  }} />
                  {noteSaveStatus['pathNotes'] === 'saving' ? 'Saving...' : 'Saved'}
                </span>
                
                {/* Priority Slider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 14px',
                  background: 'rgba(248,250,252,0.9)',
                  borderRadius: '10px',
                  border: '1px solid rgba(226,232,240,0.5)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '36px' }}>
                    <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</span>
                    <span style={{ 
                      fontSize: '14px', 
                      fontWeight: 700, 
                      color: getPriorityColor(currentPriority),
                      textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}>{currentPriority}</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px',
                    width: '160px',
                  }}>
                    <style>{`
                      .priority-slider::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: white;
                        cursor: pointer;
                        border: 2px solid #8b5cf6;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                        margin-top: -5px;
                      }
                      .priority-slider::-moz-range-thumb {
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: white;
                        cursor: pointer;
                        border: 2px solid #8b5cf6;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                      }
                      .priority-slider::-webkit-slider-runnable-track {
                        height: 6px;
                        border-radius: 3px;
                      }
                      .priority-slider::-moz-range-track {
                        height: 6px;
                        border-radius: 3px;
                      }
                    `}</style>
                    <input
                      className="priority-slider"
                      type="range"
                      min="0"
                      max="100"
                      value={currentPriority}
                      onChange={(e) => {
                        const newPriority = parseInt(e.target.value, 10);
                        updatePathPriorityHandler(activePathId, newPriority);
                      }}
                      style={{
                        width: '100%',
                        height: '6px',
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        background: `linear-gradient(to right, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)`,
                        borderRadius: '3px',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#94a3b8' }}>
                      <span style={{ color: '#3b82f6' }}>Low</span>
                      <span style={{ color: '#ef4444' }}>High</span>
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-start',
                    gap: '2px',
                    fontSize: '9px',
                    color: '#64748b',
                    minWidth: '70px',
                  }}>
                    <span><span style={{ fontWeight: 600, color: '#ef4444' }}>{higherPriorityCount}</span> higher</span>
                    {samePriorityCount > 0 && <span><span style={{ fontWeight: 600, color: '#8b5cf6' }}>{samePriorityCount}</span> same</span>}
                    <span><span style={{ fontWeight: 600, color: '#3b82f6' }}>{lowerPriorityCount}</span> lower</span>
                  </div>
                </div>
                
                <button
                  onClick={() => setPathNotesFocusMode(false)}
                  title="Close (Esc)"
                  style={{
                    background: 'rgba(100,116,139,0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(100,116,139,0.2)';
                    e.currentTarget.style.color = '#475569';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(100,116,139,0.1)';
                    e.currentTarget.style.color = '#64748b';
                  }}
                >
                  ✕
                </button>
              </div>
              
              {/* Content area */}
              <div style={{
                flex: 1,
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                background: 'rgba(248,250,252,0.5)',
              }}>
                {/* Path-level notes section */}
                <div style={{
                  background: 'rgba(255,255,255,0.9)',
                  borderRadius: '12px',
                  border: '1px solid rgba(226,232,240,0.6)',
                  overflow: 'hidden',
                }}>
                  <div style={{ 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: '#1e293b',
                    padding: '12px 16px',
                    background: 'rgba(248,250,252,0.8)',
                    borderBottom: '1px solid rgba(226,232,240,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span>📋</span>
                    <span>Path Notes</span>
                  </div>
                  {/* Minimal formatting toolbar - compact and subtle */}
                  <div style={{
                    display: 'flex',
                    gap: '1px',
                    padding: '4px 8px',
                    background: 'transparent',
                    borderBottom: '1px solid rgba(226,232,240,0.3)',
                  }}>
                    {[
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>, cmd: 'bold', title: 'Bold' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>, cmd: 'italic', title: 'Italic' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>, cmd: 'underline', title: 'Underline' },
                      { icon: 'sep' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>, cmd: 'insertUnorderedList', title: 'Bullet list' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="8" fontSize="7" fill="currentColor" stroke="none">1</text><text x="3" y="14" fontSize="7" fill="currentColor" stroke="none">2</text><text x="3" y="20" fontSize="7" fill="currentColor" stroke="none">3</text></svg>, cmd: 'insertOrderedList', title: 'Numbered list' },
                      { icon: 'sep' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, cmd: 'createLink', title: 'Link' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, cmd: 'insertImage', title: 'Image' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>, cmd: 'insertVideo', title: 'Video' },
                      { icon: 'sep' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>, cmd: 'foreColor', title: 'Text color' },
                      { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><rect x="2" y="14" width="20" height="6" rx="1" fill="currentColor" opacity="0.3"/></svg>, cmd: 'hiliteColor', title: 'Highlight' },
                    ].map((btn, i) => (
                      btn.icon === 'sep' ? (
                        <div key={i} style={{ width: '1px', height: '16px', background: 'rgba(203,213,225,0.4)', margin: '0 4px' }} />
                      ) : (
                        <button
                          key={i}
                          title={btn.title}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (btn.cmd === 'createLink') {
                              const url = prompt('Enter URL:', 'https://');
                              if (url) document.execCommand('createLink', false, url);
                            } else if (btn.cmd === 'insertImage') {
                              const url = prompt('Enter image URL:', 'https://');
                              if (url) document.execCommand('insertImage', false, url);
                            } else if (btn.cmd === 'insertVideo') {
                              const url = prompt('Enter YouTube or video URL:', 'https://www.youtube.com/watch?v=');
                              if (url) {
                                const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
                                if (youtubeMatch) {
                                  const iframe = `<iframe width="100%" height="200" src="https://www.youtube.com/embed/${youtubeMatch[1]}" frameborder="0" allowfullscreen style="border-radius:8px;margin:8px 0;"></iframe>`;
                                  document.execCommand('insertHTML', false, iframe);
                                } else {
                                  const video = `<video controls src="${url}" style="max-width:100%;border-radius:8px;margin:8px 0;"></video>`;
                                  document.execCommand('insertHTML', false, video);
                                }
                              }
                            } else if (btn.cmd === 'foreColor') {
                              const color = prompt('Enter color (hex or name):', '#3b82f6');
                              if (color) document.execCommand('foreColor', false, color);
                            } else if (btn.cmd === 'hiliteColor') {
                              const color = prompt('Enter highlight color:', '#fef08a');
                              if (color) document.execCommand('hiliteColor', false, color);
                            } else {
                              document.execCommand(btn.cmd!, false);
                            }
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '3px',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(59,130,246,0.08)';
                            e.currentTarget.style.color = '#3b82f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#94a3b8';
                          }}
                        >
                          {btn.icon}
                        </button>
                      )
                    ))}
                  </div>
                  <div
                    contentEditable
                    dir="ltr"
                    dangerouslySetInnerHTML={{ __html: pathNotes[activePathId || ''] || '' }}
                    onInput={(e) => {
                      const content = (e.target as HTMLDivElement).innerHTML;
                      handlePathNotesChange(content);
                    }}
                    onBlur={(e) => {
                      const content = (e.target as HTMLDivElement).innerHTML;
                      handlePathNotesChange(content);
                    }}
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      maxHeight: '250px',
                      padding: '14px 16px',
                      fontSize: '14px',
                      border: 'none',
                      background: 'white',
                      color: '#1e293b',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      lineHeight: 1.6,
                      boxSizing: 'border-box',
                      outline: 'none',
                      textAlign: 'left',
                      direction: 'ltr',
                      overflow: 'auto',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    suppressContentEditableWarning={true}
                  />
                </div>
                
                {/* Node notes section */}
                <div>
                  <div style={{ 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: '#1e293b',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span>📝</span>
                    <span>Node Notes</span>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                      ({sortedNodeIds.length} nodes)
                    </span>
                  </div>
                  
                  {sortedNodeIds.length === 0 ? (
                    <div style={{ 
                      fontSize: '13px', 
                      color: '#94a3b8', 
                      textAlign: 'center', 
                      padding: '32px',
                      background: 'rgba(255,255,255,0.7)',
                      borderRadius: '10px',
                      border: '1px dashed rgba(148,163,184,0.4)',
                    }}>
                      No nodes in this path yet. Click nodes on the diagram to add them.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {sortedNodeIds.map((nodeId) => {
                        const node = nodes.find(n => n.id === nodeId);
                        const nodeData = node?.data as NodeData | undefined;
                        const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
                        
                        return (
                          <div key={nodeId} style={{ 
                            background: 'rgba(255,255,255,0.9)',
                            borderRadius: '10px',
                            border: '1px solid rgba(226,232,240,0.6)',
                            overflow: 'hidden',
                          }}>
                            <div style={{ 
                              fontSize: '12px', 
                              fontWeight: '600', 
                              color: nodeData?.color || '#1e293b',
                              padding: '10px 14px',
                              background: 'rgba(248,250,252,0.8)',
                              borderBottom: '1px solid rgba(226,232,240,0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}>
                              {nodeData?.label || nodeId}
                            </div>
                            {/* Minimal formatting toolbar */}
                            <div style={{
                              display: 'flex',
                              gap: '1px',
                              padding: '3px 8px',
                              background: 'transparent',
                              borderBottom: '1px solid rgba(226,232,240,0.2)',
                            }}>
                              {[
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>, cmd: 'bold', title: 'Bold' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>, cmd: 'italic', title: 'Italic' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>, cmd: 'underline', title: 'Underline' },
                                { icon: 'sep' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>, cmd: 'insertUnorderedList', title: 'Bullet list' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="8" fontSize="7" fill="currentColor" stroke="none">1</text><text x="3" y="14" fontSize="7" fill="currentColor" stroke="none">2</text><text x="3" y="20" fontSize="7" fill="currentColor" stroke="none">3</text></svg>, cmd: 'insertOrderedList', title: 'Numbered list' },
                                { icon: 'sep' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, cmd: 'createLink', title: 'Link' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, cmd: 'insertImage', title: 'Image' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>, cmd: 'insertVideo', title: 'Video' },
                                { icon: 'sep' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>, cmd: 'foreColor', title: 'Color' },
                                { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><rect x="2" y="14" width="20" height="6" rx="1" fill="currentColor" opacity="0.3"/></svg>, cmd: 'hiliteColor', title: 'Highlight' },
                              ].map((btn, i) => (
                                btn.icon === 'sep' ? (
                                  <div key={i} style={{ width: '1px', height: '14px', background: 'rgba(203,213,225,0.3)', margin: '0 3px' }} />
                                ) : (
                                  <button
                                    key={i}
                                    title={btn.title}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      if (btn.cmd === 'createLink') {
                                        const url = prompt('Enter URL:', 'https://');
                                        if (url) document.execCommand('createLink', false, url);
                                      } else if (btn.cmd === 'insertImage') {
                                        const url = prompt('Enter image URL:', 'https://');
                                        if (url) document.execCommand('insertImage', false, url);
                                      } else if (btn.cmd === 'insertVideo') {
                                        const url = prompt('Enter YouTube or video URL:', 'https://www.youtube.com/watch?v=');
                                        if (url) {
                                          const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
                                          if (youtubeMatch) {
                                            const iframe = `<iframe width="100%" height="150" src="https://www.youtube.com/embed/${youtubeMatch[1]}" frameborder="0" allowfullscreen style="border-radius:6px;margin:6px 0;"></iframe>`;
                                            document.execCommand('insertHTML', false, iframe);
                                          } else {
                                            const video = `<video controls src="${url}" style="max-width:100%;border-radius:6px;margin:6px 0;"></video>`;
                                            document.execCommand('insertHTML', false, video);
                                          }
                                        }
                                      } else if (btn.cmd === 'foreColor') {
                                        const color = prompt('Enter color (hex or name):', '#3b82f6');
                                        if (color) document.execCommand('foreColor', false, color);
                                      } else if (btn.cmd === 'hiliteColor') {
                                        const color = prompt('Enter highlight color:', '#fef08a');
                                        if (color) document.execCommand('hiliteColor', false, color);
                                      } else {
                                        document.execCommand(btn.cmd!, false);
                                      }
                                    }}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      padding: '3px',
                                      borderRadius: '2px',
                                      color: '#b0b8c4',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(59,130,246,0.08)';
                                      e.currentTarget.style.color = '#3b82f6';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'transparent';
                                      e.currentTarget.style.color = '#b0b8c4';
                                    }}
                                  >
                                    {btn.icon}
                                  </button>
                                )
                              ))}
                            </div>
                            <div
                              contentEditable
                              dangerouslySetInnerHTML={{ __html: content || '' }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onInput={(e) => {
                                const newContent = (e.target as HTMLDivElement).innerHTML;
                                setSidebarNodeContent(prev => ({ ...prev, [nodeId]: newContent }));
                                
                                setNodePathMap(prev => ({
                                  ...prev,
                                  [activePathId]: {
                                    ...(prev[activePathId] || {}),
                                    [nodeId]: newContent,
                                  },
                                }));
                                setPathLastUpdated(prev => ({ ...prev, [activePathId]: Date.now() }));
                                
                                if (debounceTimerRef.current[nodeId]) {
                                  clearTimeout(debounceTimerRef.current[nodeId]);
                                }
                                debounceTimerRef.current[nodeId] = setTimeout(async () => {
                                  try {
                                    if (DATA_SOURCE === 'notion') {
                                      await notionService.saveNodePath({
                                        id: `${activePathId}_${nodeId}`,
                                        pathId: activePathId,
                                        nodeId: nodeId,
                                        content: newContent,
                                      });
                                    } else {
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
                                    }
                                  } catch (error) {
                                    console.error('Error saving node content:', error);
                                  }
                                }, 1000);
                              }}
                              style={{
                                width: '100%',
                                minHeight: '50px',
                                maxHeight: '180px',
                                padding: '12px 14px',
                                fontSize: '13px',
                                border: 'none',
                                background: 'white',
                                color: '#334155',
                                fontFamily: 'inherit',
                                lineHeight: 1.5,
                                boxSizing: 'border-box',
                                outline: 'none',
                                overflow: 'auto',
                              }}
                              suppressContentEditableWarning={true}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer */}
              <div style={{
                padding: '10px 20px',
                borderTop: '1px solid rgba(226,232,240,0.6)',
                background: 'rgba(248,250,252,0.8)',
                display: 'flex',
                gap: '16px',
                fontSize: '10px',
                color: '#64748b',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ 
                    background: 'white', 
                    padding: '2px 5px', 
                    borderRadius: '3px',
                    border: '1px solid rgba(226,232,240,0.6)',
                    fontWeight: 500,
                  }}>Esc</span>
                  <span>Close</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ 
                    background: 'white', 
                    padding: '2px 5px', 
                    borderRadius: '3px',
                    border: '1px solid rgba(226,232,240,0.6)',
                    fontWeight: 500,
                  }}>⌘B</span>
                  <span>Bold</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ 
                    background: 'white', 
                    padding: '2px 5px', 
                    borderRadius: '3px',
                    border: '1px solid rgba(226,232,240,0.6)',
                    fontWeight: 500,
                  }}>⌘I</span>
                  <span>Italic</span>
                </span>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Full-screen Sidebar Focus Mode Overlay */}
      {sidebarFocusMode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(20px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSidebarFocusMode(false);
          }}
        >
          <div
            style={{
              width: '95%',
              maxWidth: '800px',
              height: '90vh',
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(20px)',
              borderRadius: '16px',
              boxShadow: '0 25px 80px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset',
              border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(226,232,240,0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(248,250,252,0.8)',
              backdropFilter: 'blur(10px)',
              flexShrink: 0,
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.1) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}>
                📁
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                  Path Manager
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {pathsList.length} paths
                </div>
              </div>
              <button
                onClick={() => setSidebarFocusMode(false)}
                title="Close (Esc)"
                style={{
                  background: 'rgba(100,116,139,0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(100,116,139,0.2)';
                  e.currentTarget.style.color = '#475569';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(100,116,139,0.1)';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Content - reuse FolderTree */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 24px' }}>
              {/* Quick actions */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
                <button
                  onClick={createNewPath}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>+</span>
                  New Path
                </button>
                <button
                  onClick={() => {
                    resetView();
                    setSelectedNodeFilter(null);
                    setSelectedNodeFilterLabel('');
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Clear View
                </button>
              </div>
              
              {/* View mode selector */}
              <div style={{
                display: 'flex',
                gap: '4px',
                padding: '4px',
                background: '#f1f5f9',
                borderRadius: '10px',
                marginBottom: '16px',
                flexShrink: 0,
              }}>
                {[
                  { mode: 'folder' as const, label: '📁 Folders', icon: '📁' },
                  { mode: 'alpha' as const, label: '🔤 A-Z', icon: '🔤' },
                  { mode: 'latest' as const, label: '🕐 Latest', icon: '🕐' },
                  { mode: 'priority' as const, label: '⭐ Priority', icon: '⭐' },
                ].map((v) => (
                  <button
                    key={v.mode}
                    onClick={() => setViewMode(v.mode)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      fontSize: '12px',
                      fontWeight: viewMode === v.mode ? 600 : 500,
                      background: viewMode === v.mode ? 'white' : 'transparent',
                      color: viewMode === v.mode ? '#1d4ed8' : '#64748b',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: viewMode === v.mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              
              {/* Scrollable content area */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {viewMode === 'folder' ? (
                /* FolderTree for folder view - reuse the same component from sidebar */
                <FolderTree
                  folders={folderTree}
                  paths={folderPathItems}
                  activePath={activePath}
                  expandedFolders={expandedFolders}
                  highlightedFolderId={highlightedFolderId}
                  onToggleFolder={handleToggleFolder}
                  onSelectPath={(pathName) => {
                    showPath(pathName);
                    setSidebarFocusMode(false);
                  }}
                  onCreateFolder={handleCreateFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onRenameFolder={handleRenameFolder}
                  onMovePathToFolder={handleMovePathToFolder}
                  onMoveFolderToFolder={handleMoveFolderToFolder}
                  onDeletePath={(pathName) => deletePathByName(pathName)}
                  onRenamePath={renamePath}
                  onDoubleClickPath={(pathName) => {
                    if (activePath !== pathName) {
                      showPath(pathName);
                    }
                    setNotesPathName(pathName);
                    setPathNotesFocusMode(true);
                    setSidebarFocusMode(false);
                  }}
                  hideUnassigned={true}
                  autoEditPathId={autoEditPathId}
                  onAutoEditComplete={() => setAutoEditPathId(null)}
                />
              ) : (
                /* Simple list for A-Z, Latest, and Priority views */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(viewMode === 'alpha' 
                    ? [...pathsList].sort((a, b) => a.name.localeCompare(b.name))
                    : viewMode === 'priority'
                    ? [...pathsList].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
                    : [...pathsList].sort((a, b) => (pathLastUpdated[b.id] || 0) - (pathLastUpdated[a.id] || 0))
                  ).map((path) => {
                    const priorityColor = `rgb(${Math.round(239 * ((path.priority ?? 50) / 100) + 59 * (1 - (path.priority ?? 50) / 100))}, ${Math.round(68 * ((path.priority ?? 50) / 100) + 130 * (1 - (path.priority ?? 50) / 100))}, ${Math.round(68 * ((path.priority ?? 50) / 100) + 246 * (1 - (path.priority ?? 50) / 100))})`;
                    return (
                    <div
                      key={path.id}
                      onClick={() => {
                        showPath(path.name);
                        setSidebarFocusMode(false);
                      }}
                      style={{
                        padding: '14px 16px',
                        background: activePath === path.name 
                          ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                          : '#f8fafc',
                        border: activePath === path.name 
                          ? '1px solid rgba(59,130,246,0.3)'
                          : '1px solid #e2e8f0',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (activePath !== path.name) {
                          e.currentTarget.style.background = '#f1f5f9';
                          e.currentTarget.style.borderColor = '#cbd5e1';
                        }
                        // Show priority slider on hover in priority view
                        const slider = e.currentTarget.querySelector('.priority-slider-container') as HTMLElement;
                        if (slider) slider.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        if (activePath !== path.name) {
                          e.currentTarget.style.background = '#f8fafc';
                          e.currentTarget.style.borderColor = '#e2e8f0';
                        }
                        // Hide priority slider on mouse leave
                        const slider = e.currentTarget.querySelector('.priority-slider-container') as HTMLElement;
                        if (slider) slider.style.opacity = '0';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Priority indicator dot */}
                        {path.priority !== undefined && (
                          <span 
                            title={`Priority: ${path.priority}`}
                            style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              flexShrink: 0,
                              background: priorityColor,
                              boxShadow: `0 0 6px ${priorityColor}40`,
                            }} 
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: activePath === path.name ? '#1d4ed8' : '#334155',
                          }}>
                            {path.name}
                          </div>
                          {path.category && (
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                              📁 {path.category}
                            </div>
                          )}
                        </div>
                        {/* Priority value shown in priority view */}
                        {viewMode === 'priority' && (
                          <span style={{ 
                            fontSize: '12px', 
                            color: priorityColor,
                            fontWeight: 600,
                            flexShrink: 0,
                            minWidth: '28px',
                            textAlign: 'right',
                          }}>
                            {path.priority ?? 50}
                          </span>
                        )}
                      </div>
                      {/* Inline priority slider - only in priority view */}
                      {viewMode === 'priority' && (
                        <div 
                          className="priority-slider-container"
                          style={{ 
                            marginTop: '10px', 
                            opacity: 0, 
                            transition: 'opacity 0.15s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span style={{ fontSize: '10px', color: '#64748b' }}>Priority:</span>
                          <input
                            className="priority-slider"
                            type="range"
                            min="0"
                            max="100"
                            value={path.priority ?? 50}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newPriority = parseInt(e.target.value);
                              updatePathPriorityHandler(path.id, newPriority);
                            }}
                            style={{
                              flex: 1,
                              height: '6px',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                              background: `linear-gradient(to right, #3b82f6 0%, #ef4444 100%)`,
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              )}
              </div>
              
              {/* Sticky Unassigned Paths Section (only in folder view) */}
              {viewMode === 'folder' && (
                <div style={{ flexShrink: 0 }}>
                <UnassignedPathsSection
                  paths={folderPathItems}
                  activePath={activePath}
                  onSelectPath={(pathName) => {
                    showPath(pathName);
                    setSidebarFocusMode(false);
                  }}
                  onMovePathToFolder={handleMovePathToFolder}
                  onDeletePath={(pathName) => deletePathByName(pathName)}
                  onRenamePath={renamePath}
                  onDoubleClickPath={(pathName) => {
                    if (activePath !== pathName) {
                      showPath(pathName);
                    }
                    setNotesPathName(pathName);
                    setPathNotesFocusMode(true);
                    setSidebarFocusMode(false);
                  }}
                  autoEditPathId={autoEditPathId}
                  onAutoEditComplete={() => setAutoEditPathId(null)}
                />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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