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
import { FolderTree, type FolderTreeNode, type PathItem } from './components/FolderTree';

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
          paddingRight: 16,
          cursor: 'pointer',
          borderRadius: 4,
          padding: '2px 4px',
          margin: '-2px -4px 3px -4px',
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
  status?: string;
  dateUpdated?: string;
  lastUpdated?: number; // timestamp for sorting by latest activity
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
  
  // View mode: 'folder' (default, shows nested folders), 'alpha' (A-Z list), 'latest' (by last updated)
  const [viewMode, setViewMode] = useState<'folder' | 'alpha' | 'latest'>('folder');
  
  // Track last updated timestamps for each path (pathId -> timestamp)
  const [pathLastUpdated, setPathLastUpdated] = useState<Record<string, number>>({});
  
  // Panel position and size state for draggable/resizable panels
  const [leftPanelPos, setLeftPanelPos] = useState({ x: 20, y: 20 });
  const [leftPanelSize, setLeftPanelSize] = useState({ width: 260, height: 600 });
  const [infoPanelPos, setInfoPanelPos] = useState({ x: window.innerWidth - 400, y: 20 });
  const [infoPanelSize, setInfoPanelSize] = useState({ width: 360, height: 500 });
  const [notesPanelPos, setNotesPanelPos] = useState({ x: 300, y: 20 });
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
  
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const notesPanelRef = useRef<HTMLDivElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  
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
  const [noteSaveStatus, setNoteSaveStatus] = useState<Record<string, 'saved' | 'saving'>>({});
  
  // Advanced editor features
  const [noteUndoStack, setNoteUndoStack] = useState<Record<string, string[]>>({});
  const [noteRedoStack, setNoteRedoStack] = useState<Record<string, string[]>>({});
  const [noteLastEdited, setNoteLastEdited] = useState<Record<string, number>>({});
  const [editorFocusMode, setEditorFocusMode] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState({ x: 0, y: 0 });
  const [slashMenuFilter, setSlashMenuFilter] = useState('');
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const slashStartPos = useRef<number>(0);
  
  // Helper: format relative time
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };
  
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
      if (showNotesPanel && notesPanelRef.current && !notesPanelRef.current.contains(target)) {
        setShowNotesPanel(false);
      }
      if (selectedNode && infoPanelRef.current && !infoPanelRef.current.contains(target)) {
        setSelectedNode(null);
      }
    };
    document.addEventListener('mousedown', handleOutsidePanels);
    return () => document.removeEventListener('mousedown', handleOutsidePanels);
  }, [showNotesPanel, selectedNode]);
  
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

  // Handler for toggle select button - toggles node selection without opening popup
  const handleToggleSelect = useCallback((nodeId: string) => {
    // Skip personalized nodes and path notes
    if (nodeId.startsWith('personalized-') || nodeId === PATH_NOTES_NODE_ID) return;
    
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
      return next;
    });
  }, []);

  // Stable callbacks for inline note editing (use refs to avoid recreating)
  const handleStartEditNote = useCallback((nodeId: string) => {
    if (!activePathId) return;
    setEditingNoteNodeId(nodeId);
  }, [activePathId]);

  const handleStopEditNote = useCallback(() => {
    setEditingNoteNodeId(null);
  }, []);

  // Path notes node handlers
  const handlePathNotesStartEdit = useCallback(() => {
    if (!activePathId) return;
    setEditingPathNotes('node');
  }, [activePathId]);
  
  const handlePathNotesStopEdit = useCallback(() => {
    setEditingPathNotes(null);
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
      } catch (error) {
        console.error('Error saving path notes:', error);
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

  // Sync path notes node with editing state and path notes content
  useEffect(() => {
    const currentPathId = activePathId;
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
  }, [editingPathNotes, pathNotes, activePathId, activePath, handlePathNotesStartEdit, handlePathNotesStopEdit, handlePathNotesChange]);


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
        setShowNotesPanel(false);
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
    if (!pathId || nodeIds.size === 0) return;
    
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
      const anchorNode = highlightedNodes[0] || layoutedNodes[0];
      if (anchorNode) {
        const topNode = highlightedNodes.length > 0
          ? highlightedNodes.reduce((top, n) => n.position.y < top.position.y ? n : top, highlightedNodes[0])
          : anchorNode;
        
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
    setEditingPathNotes(null);

    // Show path immediately
    showPath(tempName);
    // Note: auto-edit mode for new paths is handled by FolderTree

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
              UNBURDENED
            </h1>
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
                      📁 Folders
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
          </div>
          </div>
          {/* End of sticky header */}

          {/* Scrollable content based on view mode */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
            {viewMode === 'folder' ? (
              /* FolderTree - unified folder/path navigation */
              <FolderTree
                folders={folderTree}
                paths={folderPathItems}
                activePath={activePath}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                onSelectPath={(pathName) => showPath(pathName)}
                onCreateFolder={handleCreateFolder}
                onDeleteFolder={handleDeleteFolder}
                onRenameFolder={handleRenameFolder}
                onMovePathToFolder={handleMovePathToFolder}
                onMoveFolderToFolder={handleMoveFolderToFolder}
                onDeletePath={(pathName) => deletePathByName(pathName)}
                onRenamePath={renamePath}
                onShowPathNotes={(pathName) => {
                  if (activePath !== pathName) {
                    showPath(pathName);
                  }
                  setNotesPathName(pathName);
                  setShowNotesPanel(true);
                  setNotesPanelPos({ x: leftPanelPos.x + leftPanelSize.width + 10, y: leftPanelPos.y });
                }}
              />
            ) : (
              /* Plain list view for A-Z and Latest modes */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {(viewMode === 'alpha' ? alphaSortedPaths : latestSortedPaths).map((path) => (
                  <div
                    key={path.id}
                    onClick={() => showPath(path.name)}
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
                    <span style={{ fontSize: '11px', fontWeight: activePath === path.name ? '600' : '500', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {path.name}
                    </span>
                    {viewMode === 'latest' && pathLastUpdated[path.id] && (
                      <span style={{ fontSize: '9px', color: '#94a3b8', flexShrink: 0 }}>
                        {new Date(pathLastUpdated[path.id]).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
                {(viewMode === 'alpha' ? alphaSortedPaths : latestSortedPaths).length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                    {selectedNodeFilter ? 'No paths contain this node' : 'No paths found'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Notes Panel - shows when clicking info button on a path */}
        {showNotesPanel && notesPathName && activePathId && (
          <div
            ref={notesPanelRef}
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
                  value={pathNotes[activePathId || ''] || ''}
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
                  
                  const currentPathIdForPanel = activePathId;
                  
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
                              if (!currentPathIdForPanel) return;
                              try {
                                if (DATA_SOURCE === 'notion') {
                                  await notionService.saveNodePath({
                                    id: `${currentPathIdForPanel}_${nodeId}`,
                                    pathId: currentPathIdForPanel,
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
                                      pathId: currentPathIdForPanel,
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
    ref={infoPanelRef}
    style={{
      position: 'absolute',
      left: infoPanelPos.x,
      top: infoPanelPos.y,
      zIndex: 10,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.95) 100%)',
      backdropFilter: 'blur(20px)',
      padding: '0',
      borderRadius: '16px',
      width: infoPanelSize.width,
      height: infoPanelSize.height,
      overflowY: 'auto',
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.5) inset',
      border: '1px solid rgba(26,115,232,0.15)',
      color: '#1e293b',
    }}
  >
    {/* Header with drag handle */}
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        setIsDraggingPanel('info');
        setDragOffset({ x: e.clientX - infoPanelPos.x, y: e.clientY - infoPanelPos.y });
      }}
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 20px 12px 20px',
        cursor: 'move',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)',
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        borderBottom: '1px solid rgba(226,232,240,0.8)',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '18px',
            fontWeight: 700,
            color: selectedNodeData.color,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {selectedNodeData.label}
          </h2>
          <div style={{ 
            fontSize: '11px', 
            color: '#64748b',
            marginTop: '4px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {selectedNodeData.category}
          </div>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          style={{
            border: 'none',
            background: 'rgba(241,245,249,0.8)',
            cursor: 'pointer',
            fontSize: '14px',
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(241,245,249,0.8)';
            e.currentTarget.style.color = '#64748b';
          }}
        >
          ✕
        </button>
      </div>
      {/* Drag indicator */}
      <div style={{ 
        width: '40px', 
        height: '4px', 
        background: 'rgba(203,213,225,0.6)', 
        borderRadius: '2px',
        margin: '10px auto 0',
      }} />
    </div>
    
    {/* Edge resize handles */}
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'n' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 's' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'w' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, left: 0, width: 6, cursor: 'ew-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'e' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 8, bottom: 8, right: 0, width: 6, cursor: 'ew-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'nw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'ne' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'sw' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' }} />
    <div onMouseDown={(e) => { e.preventDefault(); setResizeEdge({ panel: 'info', edge: 'se' }); setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, width: infoPanelSize.width, height: infoPanelSize.height, x: infoPanelPos.x, y: infoPanelPos.y }); }} style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' }} />
    
    {/* Main content area */}
    <div style={{ padding: '16px 20px 20px' }}>
      
      {/* NOTES SECTION - Primary focus at the top */}
      {activePathId && selectedNode && (() => {
        const nodeId = selectedNode.id.replace('personalized-', '');
        const content = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
        const charCount = content.length; // For future character limit feature
        const readingTime = Math.max(1, Math.ceil(wordCount / 200));
        const lastEdited = noteLastEdited[nodeId];
        const canUndo = (noteUndoStack[nodeId]?.length || 0) > 0;
        const canRedo = (noteRedoStack[nodeId]?.length || 0) > 0;
        void charCount; // Suppress unused variable warning - available for future use
        
        // Slash command options
        const slashCommands = [
          { icon: 'B', label: 'Bold', desc: 'Make text bold', format: '**', shortcut: '⌘B' },
          { icon: 'I', label: 'Italic', desc: 'Make text italic', format: '_', shortcut: '⌘I' },
          { icon: '—', label: 'Strikethrough', desc: 'Cross out text', format: '~~', shortcut: null },
          { icon: '•', label: 'Bullet list', desc: 'Create a bullet list', format: '• ', shortcut: null },
          { icon: '1.', label: 'Numbered list', desc: 'Create a numbered list', format: '1. ', shortcut: null },
          { icon: '>', label: 'Quote', desc: 'Add a quote block', format: '> ', shortcut: null },
          { icon: '`', label: 'Code', desc: 'Inline code', format: '`', shortcut: null },
          { icon: '—', label: 'Divider', desc: 'Horizontal line', format: '\n---\n', shortcut: null },
          { icon: '[ ]', label: 'Checkbox', desc: 'Add a checkbox', format: '- [ ] ', shortcut: null },
          { icon: '#', label: 'Heading', desc: 'Section heading', format: '## ', shortcut: null },
        ].filter(cmd => 
          !slashMenuFilter || 
          cmd.label.toLowerCase().includes(slashMenuFilter.toLowerCase()) ||
          cmd.desc.toLowerCase().includes(slashMenuFilter.toLowerCase())
        );
        
        return (
          <div style={{ marginBottom: '20px', position: 'relative' }}>
            {/* Header row with title, actions, and status */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              marginBottom: '10px',
            }}>
              <span style={{ fontSize: '16px' }}>📝</span>
              <span style={{ 
                fontSize: '13px', 
                fontWeight: 600, 
                color: '#334155',
              }}>
                Your Notes
              </span>
              
              {/* Undo/Redo buttons */}
              <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
                <button
                  onClick={() => {
                    if (!canUndo) return;
                    const stack = [...(noteUndoStack[nodeId] || [])];
                    const prev = stack.pop();
                    if (prev !== undefined) {
                      setNoteUndoStack(s => ({ ...s, [nodeId]: stack }));
                      setNoteRedoStack(s => ({ ...s, [nodeId]: [...(s[nodeId] || []), content] }));
                      setSidebarNodeContent(s => ({ ...s, [nodeId]: prev }));
                      setNodePathMap(s => ({ ...s, [activePathId]: { ...(s[activePathId] || {}), [nodeId]: prev } }));
                    }
                  }}
                  disabled={!canUndo}
                  title="Undo (⌘Z)"
                  style={{
                    border: 'none',
                    background: canUndo ? 'rgba(59,130,246,0.1)' : 'transparent',
                    cursor: canUndo ? 'pointer' : 'default',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    color: canUndo ? '#3b82f6' : '#cbd5e1',
                    fontSize: '12px',
                    opacity: canUndo ? 1 : 0.5,
                    transition: 'all 0.15s ease',
                  }}
                >
                  ↩
                </button>
                <button
                  onClick={() => {
                    if (!canRedo) return;
                    const stack = [...(noteRedoStack[nodeId] || [])];
                    const next = stack.pop();
                    if (next !== undefined) {
                      setNoteRedoStack(s => ({ ...s, [nodeId]: stack }));
                      setNoteUndoStack(s => ({ ...s, [nodeId]: [...(s[nodeId] || []), content] }));
                      setSidebarNodeContent(s => ({ ...s, [nodeId]: next }));
                      setNodePathMap(s => ({ ...s, [activePathId]: { ...(s[activePathId] || {}), [nodeId]: next } }));
                    }
                  }}
                  disabled={!canRedo}
                  title="Redo (⌘⇧Z)"
                  style={{
                    border: 'none',
                    background: canRedo ? 'rgba(59,130,246,0.1)' : 'transparent',
                    cursor: canRedo ? 'pointer' : 'default',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    color: canRedo ? '#3b82f6' : '#cbd5e1',
                    fontSize: '12px',
                    opacity: canRedo ? 1 : 0.5,
                    transition: 'all 0.15s ease',
                  }}
                >
                  ↪
                </button>
              </div>
              
              {/* Focus mode toggle */}
              <button
                onClick={() => setEditorFocusMode(!editorFocusMode)}
                title={editorFocusMode ? 'Exit focus mode' : 'Focus mode'}
                style={{
                  border: 'none',
                  background: editorFocusMode ? 'rgba(59,130,246,0.15)' : 'transparent',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  color: editorFocusMode ? '#3b82f6' : '#94a3b8',
                  fontSize: '12px',
                  transition: 'all 0.15s ease',
                }}
              >
                {editorFocusMode ? '⊙' : '◎'}
              </button>
              
              {/* Spacer */}
              <div style={{ flex: 1 }} />
              
              {/* Stats: word count, reading time, last edited */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                fontSize: '10px',
                color: '#94a3b8',
              }}>
                {content && (
                  <>
                    <span title="Word count">{wordCount} words</span>
                    <span>·</span>
                    <span title="Estimated reading time">{readingTime} min read</span>
                    {lastEdited && (
                      <>
                        <span>·</span>
                        <span title={new Date(lastEdited).toLocaleString()}>
                          Edited {formatRelativeTime(lastEdited)}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              
              {/* Save status */}
              <span style={{
                fontSize: '11px',
                color: noteSaveStatus[nodeId] === 'saving' ? '#f59e0b' : '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 500,
                transition: 'color 0.2s ease',
                marginLeft: '8px',
              }}>
                {noteSaveStatus[nodeId] === 'saving' ? (
                  <>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#f59e0b',
                      animation: 'pulse 1s ease-in-out infinite',
                    }} />
                    Saving...
                  </>
                ) : (
                  <>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#22c55e',
                    }} />
                    Saved
                  </>
                )}
              </span>
            </div>
            
            {/* Rich text toolbar */}
            <div style={{
              display: 'flex',
              gap: '2px',
              padding: '6px 8px',
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              borderRadius: editorFocusMode ? '10px 10px 0 0' : '10px 10px 0 0',
              border: '1px solid #e2e8f0',
              borderBottom: 'none',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              {[
                { icon: 'B', title: 'Bold (⌘B)', style: { fontWeight: 700 }, format: '**' },
                { icon: 'I', title: 'Italic (⌘I)', style: { fontStyle: 'italic' }, format: '_' },
                { icon: 'U', title: 'Underline (⌘U)', style: { textDecoration: 'underline' }, format: '__' },
                { icon: '—', title: 'Strikethrough', style: { textDecoration: 'line-through' }, format: '~~' },
                { icon: 'sep', title: '', style: {}, format: '' },
                { icon: 'H', title: 'Heading', style: { fontWeight: 700, fontSize: '11px' }, format: '## ' },
                { icon: '•', title: 'Bullet list', style: {}, format: '• ' },
                { icon: '1.', title: 'Numbered list', style: { fontSize: '11px' }, format: '1. ' },
                { icon: '☐', title: 'Checkbox', style: { fontSize: '11px' }, format: '- [ ] ' },
                { icon: 'sep', title: '', style: {}, format: '' },
                { icon: '>', title: 'Quote', style: { fontSize: '14px' }, format: '> ' },
                { icon: '</>', title: 'Code', style: { fontFamily: 'monospace', fontSize: '10px' }, format: '`' },
                { icon: '—', title: 'Divider', style: { letterSpacing: '-2px' }, format: '\n---\n' },
                { icon: '🔗', title: 'Link (⌘K)', style: { fontSize: '11px' }, format: '[](url)' },
              ].map((btn, idx) => (
                btn.icon === 'sep' ? (
                  <div key={idx} style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 4px' }} />
                ) : (
                <button
                  key={idx}
                  title={btn.title}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const textarea = noteTextareaRef.current;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const text = textarea.value;
                      const selectedText = text.substring(start, end);
                      let newText: string;
                      let newCursorPos: number;
                      
                      if (['• ', '1. ', '> ', '## ', '- [ ] '].includes(btn.format)) {
                        newText = text.substring(0, start) + btn.format + selectedText + text.substring(end);
                        newCursorPos = start + btn.format.length + selectedText.length;
                      } else if (btn.format === '[](url)') {
                        newText = text.substring(0, start) + '[' + (selectedText || 'link text') + '](url)' + text.substring(end);
                        newCursorPos = start + 1 + (selectedText || 'link text').length + 2;
                      } else if (btn.format === '\n---\n') {
                        newText = text.substring(0, start) + '\n---\n' + text.substring(end);
                        newCursorPos = start + 5;
                      } else {
                        newText = text.substring(0, start) + btn.format + selectedText + btn.format + text.substring(end);
                        newCursorPos = end + btn.format.length * 2;
                      }
                      
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                      nativeInputValueSetter?.call(textarea, newText);
                      const inputEvent = new Event('input', { bubbles: true });
                      textarea.dispatchEvent(inputEvent);
                      
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(newCursorPos, newCursorPos);
                      }, 0);
                    }
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    color: '#475569',
                    fontSize: '12px',
                    minWidth: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.1s ease',
                    ...btn.style,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59,130,246,0.1)';
                    e.currentTarget.style.color = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#475569';
                  }}
                >
                  {btn.icon}
                </button>
                )
              ))}
              {/* Slash command hint */}
              <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>/</span>
                <span>for commands</span>
              </div>
            </div>
            
            {/* Slash command menu */}
            {showSlashMenu && (
              <div
                style={{
                  position: 'absolute',
                  left: slashMenuPos.x,
                  top: slashMenuPos.y,
                  zIndex: 1000,
                  background: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  border: '1px solid #e2e8f0',
                  minWidth: '220px',
                  maxHeight: '280px',
                  overflow: 'auto',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                  Formatting
                </div>
                {slashCommands.length === 0 ? (
                  <div style={{ padding: '12px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
                    No matching commands
                  </div>
                ) : (
                  slashCommands.map((cmd, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        const textarea = noteTextareaRef.current;
                        if (textarea) {
                          const text = textarea.value;
                          const beforeSlash = text.substring(0, slashStartPos.current);
                          const afterCursor = text.substring(textarea.selectionStart);
                          let newText: string;
                          let cursorPos: number;
                          
                          if (['• ', '1. ', '> ', '## ', '- [ ] '].includes(cmd.format)) {
                            newText = beforeSlash + cmd.format + afterCursor;
                            cursorPos = beforeSlash.length + cmd.format.length;
                          } else if (cmd.format === '\n---\n') {
                            newText = beforeSlash + '\n---\n' + afterCursor;
                            cursorPos = beforeSlash.length + 5;
                          } else {
                            newText = beforeSlash + cmd.format + cmd.format + afterCursor;
                            cursorPos = beforeSlash.length + cmd.format.length;
                          }
                          
                          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                          nativeInputValueSetter?.call(textarea, newText);
                          const inputEvent = new Event('input', { bubbles: true });
                          textarea.dispatchEvent(inputEvent);
                          
                          setShowSlashMenu(false);
                          setSlashMenuFilter('');
                          
                          setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(cursorPos, cursorPos);
                          }, 0);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: idx === slashMenuIndex ? 'rgba(59,130,246,0.08)' : 'transparent',
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={() => setSlashMenuIndex(idx)}
                    >
                      <span style={{
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f8fafc',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#475569',
                        fontWeight: 600,
                      }}>
                        {cmd.icon}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>{cmd.label}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{cmd.desc}</div>
                      </div>
                      {cmd.shortcut && (
                        <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px' }}>
                          {cmd.shortcut}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            
            {/* Notes textarea */}
            <textarea
              ref={(el) => {
                noteTextareaRef.current = el;
                // Auto-focus and place cursor at end when popup opens
                if (el) {
                  setTimeout(() => {
                    el.focus();
                    el.setSelectionRange(el.value.length, el.value.length);
                    // Auto-resize
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, editorFocusMode ? 500 : 300) + 'px';
                  }, 50);
                }
              }}
              placeholder="Start writing your notes here...

Tips:
• Type / for formatting commands
• ⌘B for bold, ⌘I for italic
• ⌘Z to undo, ⌘⇧Z to redo
• Use **bold** or _italic_ syntax"
              value={content}
              onMouseDown={(e) => e.stopPropagation()}
              onWheelCapture={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onKeyDown={(e) => {
                const textarea = e.currentTarget;
                const text = textarea.value;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const selectedText = text.substring(start, end);
                
                // Handle slash command menu navigation
                if (showSlashMenu) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSlashMenuIndex(i => Math.min(i + 1, slashCommands.length - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSlashMenuIndex(i => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Enter' && slashCommands.length > 0) {
                    e.preventDefault();
                    const cmd = slashCommands[slashMenuIndex];
                    const beforeSlash = text.substring(0, slashStartPos.current);
                    const afterCursor = text.substring(start);
                    let newText: string;
                    let cursorPos: number;
                    
                    if (['• ', '1. ', '> ', '## ', '- [ ] '].includes(cmd.format)) {
                      newText = beforeSlash + cmd.format + afterCursor;
                      cursorPos = beforeSlash.length + cmd.format.length;
                    } else if (cmd.format === '\n---\n') {
                      newText = beforeSlash + '\n---\n' + afterCursor;
                      cursorPos = beforeSlash.length + 5;
                    } else {
                      newText = beforeSlash + cmd.format + cmd.format + afterCursor;
                      cursorPos = beforeSlash.length + cmd.format.length;
                    }
                    
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                    nativeInputValueSetter?.call(textarea, newText);
                    const inputEvent = new Event('input', { bubbles: true });
                    textarea.dispatchEvent(inputEvent);
                    
                    setShowSlashMenu(false);
                    setSlashMenuFilter('');
                    
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(cursorPos, cursorPos);
                    }, 0);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowSlashMenu(false);
                    setSlashMenuFilter('');
                    return;
                  }
                }
                
                // Keyboard shortcuts
                const isMod = e.metaKey || e.ctrlKey;
                
                // Undo: ⌘Z
                if (isMod && !e.shiftKey && e.key === 'z') {
                  e.preventDefault();
                  if (canUndo) {
                    const stack = [...(noteUndoStack[nodeId] || [])];
                    const prev = stack.pop();
                    if (prev !== undefined) {
                      setNoteUndoStack(s => ({ ...s, [nodeId]: stack }));
                      setNoteRedoStack(s => ({ ...s, [nodeId]: [...(s[nodeId] || []), content] }));
                      setSidebarNodeContent(s => ({ ...s, [nodeId]: prev }));
                      setNodePathMap(s => ({ ...s, [activePathId]: { ...(s[activePathId] || {}), [nodeId]: prev } }));
                    }
                  }
                  return;
                }
                
                // Redo: ⌘⇧Z
                if (isMod && e.shiftKey && e.key === 'z') {
                  e.preventDefault();
                  if (canRedo) {
                    const stack = [...(noteRedoStack[nodeId] || [])];
                    const next = stack.pop();
                    if (next !== undefined) {
                      setNoteRedoStack(s => ({ ...s, [nodeId]: stack }));
                      setNoteUndoStack(s => ({ ...s, [nodeId]: [...(s[nodeId] || []), content] }));
                      setSidebarNodeContent(s => ({ ...s, [nodeId]: next }));
                      setNodePathMap(s => ({ ...s, [activePathId]: { ...(s[activePathId] || {}), [nodeId]: next } }));
                    }
                  }
                  return;
                }
                
                // Bold: ⌘B
                if (isMod && e.key === 'b') {
                  e.preventDefault();
                  const newText = text.substring(0, start) + '**' + selectedText + '**' + text.substring(end);
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                  nativeInputValueSetter?.call(textarea, newText);
                  textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  setTimeout(() => textarea.setSelectionRange(start + 2, end + 2), 0);
                  return;
                }
                
                // Italic: ⌘I
                if (isMod && e.key === 'i') {
                  e.preventDefault();
                  const newText = text.substring(0, start) + '_' + selectedText + '_' + text.substring(end);
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                  nativeInputValueSetter?.call(textarea, newText);
                  textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  setTimeout(() => textarea.setSelectionRange(start + 1, end + 1), 0);
                  return;
                }
                
                // Underline: ⌘U
                if (isMod && e.key === 'u') {
                  e.preventDefault();
                  const newText = text.substring(0, start) + '__' + selectedText + '__' + text.substring(end);
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                  nativeInputValueSetter?.call(textarea, newText);
                  textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  setTimeout(() => textarea.setSelectionRange(start + 2, end + 2), 0);
                  return;
                }
                
                // Link: ⌘K
                if (isMod && e.key === 'k') {
                  e.preventDefault();
                  const linkText = selectedText || 'link text';
                  const newText = text.substring(0, start) + '[' + linkText + '](url)' + text.substring(end);
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                  nativeInputValueSetter?.call(textarea, newText);
                  textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  const urlStart = start + 1 + linkText.length + 2;
                  setTimeout(() => textarea.setSelectionRange(urlStart, urlStart + 3), 0);
                  return;
                }
              }}
              onInput={(e) => {
                const textarea = e.currentTarget;
                const text = textarea.value;
                const pos = textarea.selectionStart;
                
                // Check for slash command trigger
                const textBeforeCursor = text.substring(0, pos);
                const lastSlash = textBeforeCursor.lastIndexOf('/');
                
                if (lastSlash !== -1) {
                  const textAfterSlash = textBeforeCursor.substring(lastSlash + 1);
                  // Only show menu if slash is at start of line or after whitespace, and no spaces in filter
                  const charBeforeSlash = lastSlash > 0 ? text[lastSlash - 1] : '\n';
                  if ((charBeforeSlash === '\n' || charBeforeSlash === ' ' || lastSlash === 0) && !textAfterSlash.includes(' ')) {
                    slashStartPos.current = lastSlash;
                    setSlashMenuFilter(textAfterSlash);
                    setSlashMenuIndex(0);
                    
                    // Position the menu
                    const rect = textarea.getBoundingClientRect();
                    setSlashMenuPos({ x: 20, y: rect.height + 10 });
                    setShowSlashMenu(true);
                  } else {
                    setShowSlashMenu(false);
                  }
                } else {
                  setShowSlashMenu(false);
                }
              }}
              onChange={(e) => {
                const newContent = e.target.value;
                const prevContent = content;
                
                // Push to undo stack (limit to 50 entries)
                if (prevContent !== newContent) {
                  setNoteUndoStack(prev => {
                    const stack = [...(prev[nodeId] || []), prevContent].slice(-50);
                    return { ...prev, [nodeId]: stack };
                  });
                  // Clear redo stack on new change
                  setNoteRedoStack(prev => ({ ...prev, [nodeId]: [] }));
                }
                
                setSidebarNodeContent(prev => ({ ...prev, [nodeId]: newContent }));
                
                setNodePathMap(prev => ({
                  ...prev,
                  [activePathId]: {
                    ...(prev[activePathId] || {}),
                    [nodeId]: newContent,
                  },
                }));
                
                setPathLastUpdated(prev => ({ ...prev, [activePathId]: Date.now() }));
                
                // Update last edited timestamp
                setNoteLastEdited(prev => ({ ...prev, [nodeId]: Date.now() }));
                
                // Set status to saving
                setNoteSaveStatus(prev => ({ ...prev, [nodeId]: 'saving' }));
                
                // Auto-resize
                const textarea = e.target;
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, editorFocusMode ? 500 : 300) + 'px';
                
                // Debounced auto-save
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
                    // Set status to saved after successful save
                    setNoteSaveStatus(prev => ({ ...prev, [nodeId]: 'saved' }));
                  } catch (error) {
                    console.error('Error saving node content:', error);
                    // Still mark as saved to avoid stuck state, but could show error
                    setNoteSaveStatus(prev => ({ ...prev, [nodeId]: 'saved' }));
                  }
                }, 1000);
              }}
              style={{
                width: '100%',
                minHeight: editorFocusMode ? '300px' : '120px',
                maxHeight: editorFocusMode ? '500px' : '300px',
                padding: '14px 16px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderTop: 'none',
                borderRadius: '0 0 10px 10px',
                background: '#ffffff',
                color: '#1e293b',
                resize: 'vertical',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                lineHeight: 1.6,
                boxSizing: 'border-box',
                overflow: 'auto',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                // Auto-resize
                const textarea = e.target;
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, editorFocusMode ? 500 : 300) + 'px';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0';
                e.target.style.boxShadow = 'none';
                // Close slash menu on blur
                setShowSlashMenu(false);
              }}
            />
            
            {/* Keyboard shortcuts helper */}
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #f1f5f9',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '10px',
              color: '#64748b',
            }}>
              {[
                { keys: '⌘B', label: 'Bold' },
                { keys: '⌘I', label: 'Italic' },
                { keys: '⌘U', label: 'Underline' },
                { keys: '⌘K', label: 'Link' },
                { keys: '⌘Z', label: 'Undo' },
                { keys: '⌘⇧Z', label: 'Redo' },
                { keys: '/', label: 'Commands' },
              ].map((shortcut, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ 
                    background: 'white', 
                    padding: '2px 5px', 
                    borderRadius: '3px', 
                    fontFamily: 'system-ui',
                    fontWeight: 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    border: '1px solid #e2e8f0',
                  }}>
                    {shortcut.keys}
                  </span>
                  <span>{shortcut.label}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}
      
      {/* No path loaded message */}
      {!activePathId && (
        <div style={{
          padding: '20px',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          borderRadius: '10px',
          marginBottom: '20px',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>💡</span>
            <div>
              <div style={{ fontWeight: 600, color: '#92400e', fontSize: '13px' }}>Load a path to take notes</div>
              <div style={{ fontSize: '12px', color: '#a16207', marginTop: '2px' }}>Select a path from the sidebar to enable note-taking for this node</div>
            </div>
          </div>
        </div>
      )}

      {/* Divider before documentation section */}
      {(selectedNodeData.longDescription || selectedNodeData.images?.length || selectedNodeData.video || selectedNodeData.externalLinks?.length || selectedNodeData.wikiUrl) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '8px 0 16px',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)' }} />
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Documentation
          </span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)' }} />
        </div>
      )}

      {/* Long description */}
      {selectedNodeData.longDescription && (
        <p style={{ 
          lineHeight: 1.7, 
          color: '#475569',
          fontSize: '13px',
          margin: '0 0 16px',
          padding: '12px 14px',
          background: 'rgba(241,245,249,0.5)',
          borderRadius: '8px',
          borderLeft: `3px solid ${selectedNodeData.color || '#3b82f6'}`,
        }}>
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
            borderRadius: '10px',
            marginBottom: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
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
              borderRadius: '10px',
              marginBottom: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          />
        ) : (
          <iframe
            src={selectedNodeData.video.url}
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: '10px',
              marginBottom: '12px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )
      )}

      {/* External links */}
      {(selectedNodeData.externalLinks?.length ?? 0) > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {selectedNodeData.externalLinks!.map((link) => (
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
                background: 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0.1) 100%)',
                borderRadius: '8px',
                color: '#2563eb',
                fontWeight: 500,
                fontSize: '13px',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                border: '1px solid rgba(59,130,246,0.1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.15) 100%)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0.1) 100%)';
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
      {selectedNodeData.wikiUrl && (
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
            e.currentTarget.style.boxShadow = `0 6px 20px ${selectedNodeData.color || '#3b82f6'}50`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = `0 4px 14px ${selectedNodeData.color || '#3b82f6'}40`;
          }}
        >
          <span>📚</span>
          <span>Open Documentation</span>
          <span>↗</span>
        </a>
      )}
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