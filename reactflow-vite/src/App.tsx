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
  status?: string;
  dateUpdated?: string;
  lastUpdated?: number; // timestamp for sorting by latest activity
};

// Helper to build category ID -> name map
function buildCategoryMap(categories: CategoryRecord[]): Record<string, string> {
  const map: Record<string, string> = {};
  categories.forEach(cat => {
    map[cat.id] = cat.name;
  });
  return map;
}

// Helper to get unique category IDs from paths (that still exist in categories list)

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
  const [, setPathName] = useState('');
  const [, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [sidebarNodeContent, setSidebarNodeContent] = useState<Record<string, string>>({});
  
  // Categories loaded from Notion
  const [categoriesList, setCategoriesList] = useState<CategoryRecord[]>([]);
  
  // Category ID -> Name map for quick lookups
  const categoryMap = useMemo(() => buildCategoryMap(categoriesList), [categoriesList]);

  // Build the nested category tree for rendering
  const categoryTree = useMemo(() => buildCategoryTree(categoriesList), [categoriesList]);

  // Modern recursive category tree UI (collapsible, add, delete, nest)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');

  const handleToggleExpand = (id: string) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddCategory = async (parentId: string | null) => {
    if (!newCatName.trim()) return;
    await notionService.createCategory(newCatName.trim(), parentId);
    setNewCatName('');
    setAddingParentId(null);
    // Optionally, reload categories here if not auto-updating
  };

  const handleDeleteCategory = async (cat: CategoryTreeNode) => {
    if (!window.confirm(`Delete category "${cat.name}" and all its subcategories?`)) return;
    // TODO: Implement deleteCategory in notionService (not shown here)
    // await notionService.deleteCategory(cat.notionPageId || cat.id);
    alert('Delete not implemented in this demo.');
  };

  const renderCategoryTree = (nodes: CategoryTreeNode[], level = 0) => (
    <ul style={{ marginLeft: level * 16, listStyle: 'none', paddingLeft: 0 }}>
      {nodes.map(node => (
        <li key={node.id} style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {node.children.length > 0 && (
              <button onClick={() => handleToggleExpand(node.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                {expandedCategories[node.id] !== false ? '▼' : '▶'}
              </button>
            )}
            <span style={{ fontWeight: 500, fontSize: 13 }}>{node.name}</span>
            <button onClick={() => { setAddingParentId(node.notionPageId || node.id); setNewCatName(''); }} style={{ border: 'none', background: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginLeft: 2 }}>+</button>
            <button onClick={() => handleDeleteCategory(node)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginLeft: 2 }}>🗑️</button>
          </div>
          {addingParentId === (node.notionPageId || node.id) && (
            <div style={{ margin: '4px 0 4px 24px', display: 'flex', gap: 4 }}>
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="New subcategory..."
                style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(node.notionPageId || node.id); if (e.key === 'Escape') setAddingParentId(null); }}
              />
              <button onClick={() => handleAddCategory(node.notionPageId || node.id)} style={{ fontSize: 12, color: '#3b82f6', border: 'none', background: 'none', cursor: 'pointer' }}>Add</button>
              <button onClick={() => setAddingParentId(null)} style={{ fontSize: 12, color: '#64748b', border: 'none', background: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
          {node.children.length > 0 && expandedCategories[node.id] !== false && renderCategoryTree(node.children, level + 1)}
        </li>
      ))}
      {/* Add root category */}
      {level === 0 && (
        <li style={{ marginTop: 6 }}>
          {addingParentId === null ? (
            <button onClick={() => { setAddingParentId(null); setNewCatName(''); }} style={{ border: '1px dashed #3b82f6', background: 'none', color: '#3b82f6', borderRadius: 8, fontSize: 13, padding: '2px 10px', cursor: 'pointer' }}>+ Add Category</button>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="New category..."
                style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(null); if (e.key === 'Escape') setAddingParentId(null); }}
              />
              <button onClick={() => handleAddCategory(null)} style={{ fontSize: 12, color: '#3b82f6', border: 'none', background: 'none', cursor: 'pointer' }}>Add</button>
              <button onClick={() => setAddingParentId(null)} style={{ fontSize: 12, color: '#64748b', border: 'none', background: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </li>
      )}
    </ul>
  );
  
  // Notion sync status (prefixed with _ since we're setting up the listener but UI not implemented yet)
  const [_syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [_syncMessage, setSyncMessage] = useState<string | undefined>();
  
  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedSubsubcategory, setSelectedSubsubcategory] = useState<string | null>(null);
  const [, setSaveCategory] = useState('');
  const [, setSaveSubcategory] = useState('');
  const [, setSaveSubsubcategory] = useState('');
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<{name: string; level: 'category' | 'subcategory'} | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSubcategory, setShowAddSubcategory] = useState(false);
  const [showAddSubsubcategory, setShowAddSubsubcategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // Node filter state for filtering paths by node
  const [selectedNodeFilter, setSelectedNodeFilter] = useState<string | null>(null);
  const [selectedNodeFilterLabel, setSelectedNodeFilterLabel] = useState<string>('');
  
  // Combined search state (paths + nodes autocomplete)
  const [pathSearchQuery, setPathSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
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
  const [editingPathName, setEditingPathName] = useState<string | null>(null);
  const [editingPathValue, setEditingPathValue] = useState('');
  
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

  const startEditingPath = useCallback((pathName: string) => {
    setEditingPathName(pathName);
    setEditingPathValue(pathName);
  }, []);

  const commitPathRename = useCallback(() => {
    if (!editingPathName) return;
    const trimmed = editingPathValue.trim();
    if (trimmed && trimmed !== editingPathName) {
      renamePath(editingPathName, trimmed);
    }
    setEditingPathName(null);
    setEditingPathValue('');
  }, [editingPathName, editingPathValue, renamePath]);

  const cancelPathRename = useCallback(() => {
    setEditingPathName(null);
    setEditingPathValue('');
  }, []);

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

  // Update path category (for drag and drop)
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

  // Create a new category in the Categories table
  const addNewCategory = async (categoryName: string) => {
    console.log('addNewCategory called with:', categoryName);
    console.log('Current categoriesList:', categoriesList);
    
    // Check if this category name already exists
    if (categoriesList.some(c => c.name.toLowerCase() === categoryName.toLowerCase())) {
      console.log('Category already exists:', categoryName);
      return; // Already exists
    }

    try {
      if (DATA_SOURCE === 'notion') {
        console.log('Creating category in Notion...');
        // Create category in Notion Categories table
        const newCategory = await notionService.createCategory(categoryName);
        console.log('Created new category:', newCategory);
        
        // Add to local state immediately
        setCategoriesList(prev => [...prev, newCategory]);
        
        // Select the new category
        setSelectedCategory(newCategory.id);
      } else {
        // For Google Sheets, use the old placeholder system
        const placeholderId = `__cat__${categoryName}`;
        await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'savePath',
            pathId: forceTextForSheet(placeholderId),
            pathName: '',
            nodeIds: '',
            category: categoryName,
            subcategory: '',
            subsubcategory: '',
          }),
        });
      }
    } catch (error) {
      console.error('Error creating category:', error);
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
    
    // If a category is selected, use that category for the new path
    // (Skip if it's __uncategorized__ since that means no category)
    const categoryToAssign = selectedCategory && selectedCategory !== '__uncategorized__' ? selectedCategory : undefined;

    // Optimistic UI update - add to list immediately
    setPathsList(prev => [...prev, {
      id: newId,
      name: tempName,
      nodeIds: [],
      status: 'active',
      dateUpdated: updatedAt,
      category: categoryToAssign,
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

    // Show path and start editing immediately
    showPath(tempName);
    startEditingPath(tempName);

    // Save to backend in background
    (async () => {
      try {
        if (DATA_SOURCE === 'notion') {
          await notionService.savePath({
            id: newId,
            name: tempName,
            nodeIds: [],
            dateUpdated: updatedAt,
            category: categoryToAssign,
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
  }, [startEditingPath, showPath, selectedCategory]);

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
                
                {/* Category chips - show all categories, even unused */}
                {categoriesList.map(cat => (
                  <button
                    type="button"
                    key={cat.id}
                    draggable
                    onDragStart={() => setDraggedCategory({ name: cat.id, level: 'category' })}
                    onDragEnd={() => setDraggedCategory(null)}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setSelectedSubcategory(null);
                      setSelectedSubsubcategory(null);
                      setSaveCategory(cat.id);
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
                        updatePathCategory(draggedPath, cat.id, '');
                        setDraggedPath(null);
                      }
                      // Handle dropping a category onto another category to nest it
                      if (draggedCategory && draggedCategory.name !== cat.id) {
                        // Move all paths from dragged category to be subcategories of target
                        const pathsToMove = pathsList.filter(p => p.category === draggedCategory.name);
                        pathsToMove.forEach(p => {
                          updatePathCategory(p.name, cat.id, draggedCategory.name);
                        });
                        setDraggedCategory(null);
                      }
                    }}
                    style={{
                      padding: '5px 10px',
                      fontSize: '10px',
                      fontWeight: selectedCategory === cat.id ? '600' : '500',
                      borderRadius: '12px',
                      border: selectedCategory === cat.id 
                        ? '1px solid rgba(59, 130, 246, 0.5)' 
                        : '1px solid rgba(59, 130, 246, 0.2)',
                      background: selectedCategory === cat.id 
                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                        : 'rgba(239, 246, 255, 0.5)',
                      color: selectedCategory === cat.id ? '#1d4ed8' : '#3b82f6',
                      cursor: 'grab',
                      boxShadow: selectedCategory === cat.id ? '0 1px 3px rgba(59, 130, 246, 0.15)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    {cat.name || cat.id} ({pathsList.filter(p => p.name && p.category === cat.id).length})
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
                          // Create new category in Categories table
                          addNewCategory(newCategoryName.trim());
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
                          // Create new category in Categories table
                          addNewCategory(newCategoryName.trim());
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
                            // Note: subcategories not yet supported in new category system
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
                            // Note: subcategories not yet supported in new category system
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
                            // Note: sub-subcategories not yet supported in new category system
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
                            // Note: sub-subcategories not yet supported in new category system
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

              {/* Header with title and add button */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}>
                <span style={{ 
                  fontSize: '10px', 
                  fontWeight: '600', 
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Paths</span>
                <button
                  onClick={createNewPath}
                  style={{
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: '500',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.3)';
                  }}
                  title="Create new path"
                >
                  +
                </button>
              </div>

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
              {/* Combined search filter (paths + nodes) */}
              <div ref={searchRef} style={{ marginBottom: '8px', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder={selectedNodeFilter ? `🔍 Filtering by node: ${selectedNodeFilterLabel}` : "🔍 Search paths or nodes..."}
                    value={pathSearchQuery}
                    onChange={(e) => {
                      setPathSearchQuery(e.target.value);
                      if (e.target.value) {
                        setShowSearchDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      if (pathSearchQuery) {
                        setShowSearchDropdown(true);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 28px 8px 10px',
                      fontSize: '11px',
                      border: (pathSearchQuery || selectedNodeFilter) ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: selectedNodeFilter ? 'rgba(219, 234, 254, 0.8)' : (pathSearchQuery ? 'rgba(239, 246, 255, 0.5)' : 'white'),
                      color: '#334155',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {(pathSearchQuery || selectedNodeFilter) && (
                    <button
                      onClick={() => {
                        setPathSearchQuery('');
                        setSelectedNodeFilter(null);
                        setSelectedNodeFilterLabel('');
                        setShowSearchDropdown(false);
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
                
                {/* Autocomplete dropdown for nodes */}
                {showSearchDropdown && pathSearchQuery && !selectedNodeFilter && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '250px',
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
                      const query = pathSearchQuery.toLowerCase();
                      
                      // Get matching nodes
                      const matchingNodes = nodes
                        .filter(n => !n.id.startsWith('personalized-') && !n.id.startsWith('__'))
                        .map(n => ({ id: n.id, label: (n.data as NodeData)?.label || n.id }))
                        .filter(n => n.label.toLowerCase().includes(query))
                        .sort((a, b) => a.label.localeCompare(b.label))
                        .slice(0, 10);
                      
                      // Get matching paths
                      const matchingPaths = pathsList
                        .filter(p => p.name && p.name.toLowerCase().includes(query))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .slice(0, 10);
                      
                      if (matchingNodes.length === 0 && matchingPaths.length === 0) {
                        return (
                          <div style={{ padding: '10px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                            No matches found
                          </div>
                        );
                      }
                      
                      return (
                        <>
                          {/* Nodes section */}
                          {matchingNodes.length > 0 && (
                            <>
                              <div style={{ 
                                padding: '6px 10px', 
                                fontSize: '9px', 
                                fontWeight: '600', 
                                color: '#94a3b8', 
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                              }}>
                                🔵 Filter by Node
                              </div>
                              {matchingNodes.map(node => (
                                <button
                                  key={`node-${node.id}`}
                                  onClick={() => {
                                    setSelectedNodeFilter(node.id);
                                    setSelectedNodeFilterLabel(node.label);
                                    setPathSearchQuery('');
                                    setShowSearchDropdown(false);
                                  }}
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '8px 10px',
                                    fontSize: '11px',
                                    textAlign: 'left',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#334155',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f1f5f9',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <span style={{ color: '#3b82f6', marginRight: '6px' }}>●</span>
                                  {node.label}
                                </button>
                              ))}
                            </>
                          )}
                          
                          {/* Paths section */}
                          {matchingPaths.length > 0 && (
                            <>
                              <div style={{ 
                                padding: '6px 10px', 
                                fontSize: '9px', 
                                fontWeight: '600', 
                                color: '#94a3b8', 
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                                marginTop: matchingNodes.length > 0 ? '4px' : 0,
                              }}>
                                📁 Paths
                              </div>
                              {matchingPaths.map(path => (
                                <button
                                  key={`path-${path.id}`}
                                  onClick={() => {
                                    setPathSearchQuery(path.name);
                                    setShowSearchDropdown(false);
                                    showPath(path.name);
                                  }}
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '8px 10px',
                                    fontSize: '11px',
                                    textAlign: 'left',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#334155',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f1f5f9',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <span style={{ color: '#64748b', marginRight: '6px' }}>📄</span>
                                  {path.name}
                                  {path.category && categoryMap[path.category] && (
                                    <span style={{ color: '#94a3b8', fontSize: '9px', marginLeft: '6px' }}>
                                      ({categoryMap[path.category]})
                                    </span>
                                  )}
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              
              {/* Filtered and grouped paths list */}
              {(() => {
                // Filter paths first
                const filteredPaths = pathsList.filter(path => {
                  // Filter out category placeholders (empty names)
                  if (!path.name) return false;
                  
                  // Filter by path search query
                  if (pathSearchQuery && !path.name.toLowerCase().includes(pathSearchQuery.toLowerCase())) {
                    return false;
                  }
                  
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
                  // Use local pathLastUpdated first, then fall back to path.lastUpdated from the record
                  sortedPaths = [...filteredPaths].sort((a, b) => {
                    const aTime = pathLastUpdated[a.id] || a.lastUpdated || 0;
                    const bTime = pathLastUpdated[b.id] || b.lastUpdated || 0;
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
                        {editingPathName === path.name ? (
                          <div
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              background: 'rgba(255,255,255,0.9)',
                              border: '1px solid rgba(59, 130, 246, 0.35)',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <span style={{ color: '#94a3b8', fontSize: '10px', lineHeight: 1 }}>⋮⋮</span>
                            <input
                              type="text"
                              value={editingPathValue}
                              onChange={(e) => setEditingPathValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitPathRename();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelPathRename();
                                }
                              }}
                              onBlur={commitPathRename}
                              onFocus={(e) => e.target.select()}
                              autoFocus
                              style={{
                                flex: 1,
                                fontSize: '11px',
                                fontWeight: '600',
                                color: '#1e293b',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                              }}
                            />
                          </div>
                        ) : (
                          <button
                            draggable
                            onDragStart={() => setDraggedPath(path.name)}
                            onDragEnd={() => setDraggedPath(null)}
                            onClick={() => showPath(path.name)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              startEditingPath(path.name);
                            }}
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
                        )}
                        {/* Delete button - always visible */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePathByName(path.name);
                          }}
                          style={{
                            padding: '6px 8px',
                            background: 'rgba(254, 226, 226, 0.6)',
                            color: '#dc2626',
                            border: '1px solid rgba(220, 38, 38, 0.2)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '600',
                            lineHeight: 1,
                            opacity: 0.7,
                            transition: 'opacity 0.15s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                          title="Delete path"
                        >
                          🗑
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
                    {editingPathName === path.name ? (
                      <div
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          background: 'rgba(255,255,255,0.9)',
                          border: '1px solid rgba(59, 130, 246, 0.35)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <span style={{ color: '#94a3b8', fontSize: '10px', lineHeight: 1 }}>⋮⋮</span>
                        <input
                          type="text"
                          value={editingPathValue}
                          onChange={(e) => setEditingPathValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitPathRename();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelPathRename();
                            }
                          }}
                          onBlur={commitPathRename}
                          onFocus={(e) => e.target.select()}
                          autoFocus
                          style={{
                            flex: 1,
                            fontSize: '11px',
                            fontWeight: '500',
                            color: '#1e293b',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        draggable
                        onDragStart={() => setDraggedPath(path.name)}
                        onDragEnd={() => setDraggedPath(null)}
                        onClick={() => showPath(path.name)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEditingPath(path.name);
                        }}
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
                    )}
                    {/* Delete button - always visible */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePathByName(path.name);
                      }}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(254, 226, 226, 0.6)',
                        color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        lineHeight: 1,
                        opacity: 0.7,
                        transition: 'opacity 0.15s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      title="Delete path"
                    >
                      🗑
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