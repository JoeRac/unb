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
  saveNodePathAudioNote,
  savePathAudioNote,
  buildNodePathAudioMap,
  buildPathAudioMap,
} from './services/notion';

// Import FolderTree component for unified folder/path navigation
import { FolderTree, UnassignedPathsSection, type FolderTreeNode, type PathItem } from './components/FolderTree';

// Import AudioRecorder component
import { AudioRecorder } from './components/AudioRecorder';

// Import NotionPageRenderer for documentation panel
import NotionPageRenderer from './components/NotionPageRenderer';

// Dagre layout helper
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 240;
const nodeHeight = 80;

// ============================================
// Layout Types and Functions
// ============================================

type LayoutType = 
  | 'default'           // Standard dagre hierarchy (TB)
  | 'centered'          // Centered horizontally per rank
  | 'horizontal'        // Left-to-right hierarchy
  | 'horizontal-row'    // All nodes in single horizontal row
  | 'vertical-column'   // All nodes in single vertical column
  | 'diagonal'          // Nodes arranged diagonally
  | 'circle'            // Nodes in a circle
  | 'spiral'            // Nodes in a spiral pattern
  | 'grid'              // Grid layout
  | 'radial'            // Radial/sunburst from center
  | 'tree-centered'     // Centered tree layout
  | 'inverted'          // Bottom-to-top hierarchy
  | 'wave'              // Sine wave pattern
  | 'diamond'           // Diamond shape
  | 'hexagonal'         // Hexagonal grid
  | 'zigzag'            // Alternating left-right
  | 'scattered'         // Artistic scattered
  | 'concentric'        // Concentric circles by depth
  | 'columns-by-depth'  // Vertical columns per depth level
  | 'cascade';          // Cascading waterfall

const LAYOUT_LABELS: Record<LayoutType, string> = {
  'default': 'Hierarchy',
  'centered': 'Centered',
  'horizontal': 'Horizontal Tree',
  'horizontal-row': 'Single Row',
  'vertical-column': 'Single Column',
  'diagonal': 'Diagonal',
  'circle': 'Circle',
  'spiral': 'Spiral',
  'grid': 'Grid',
  'radial': 'Radial',
  'tree-centered': 'Centered Tree',
  'inverted': 'Inverted',
  'wave': 'Wave',
  'diamond': 'Diamond',
  'hexagonal': 'Hexagonal',
  'zigzag': 'Zigzag',
  'scattered': 'Scattered',
  'concentric': 'Concentric',
  'columns-by-depth': 'Depth Columns',
  'cascade': 'Cascade',
};

const LAYOUT_ORDER: LayoutType[] = [
  'centered', 'default', 'horizontal', 'tree-centered', 'inverted',
  'horizontal-row', 'vertical-column', 'diagonal', 'zigzag', 'cascade',
  'circle', 'spiral', 'radial', 'concentric',
  'grid', 'hexagonal', 'diamond', 'wave', 'columns-by-depth', 'scattered'
];

// Helper to calculate node depth from edges
function calculateNodeDepths(nodes: FlowNode[], edges: FlowEdge[]): Map<string, number> {
  const depths = new Map<string, number>();
  const childToParents = new Map<string, string[]>();
  
  edges.forEach(edge => {
    const parents = childToParents.get(edge.target) || [];
    parents.push(edge.source);
    childToParents.set(edge.target, parents);
  });
  
  // Find roots (nodes with no parents)
  const nodeIds = new Set(nodes.map(n => n.id));
  const hasParent = new Set(edges.map(e => e.target));
  const roots = nodes.filter(n => !hasParent.has(n.id)).map(n => n.id);
  
  // BFS to calculate depths
  const queue = roots.map(id => ({ id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depths.has(id) && depths.get(id)! <= depth) continue;
    depths.set(id, depth);
    
    // Find children
    edges.forEach(edge => {
      if (edge.source === id && nodeIds.has(edge.target)) {
        queue.push({ id: edge.target, depth: depth + 1 });
      }
    });
  }
  
  // Assign depth 0 to any disconnected nodes
  nodes.forEach(n => {
    if (!depths.has(n.id)) depths.set(n.id, 0);
  });
  
  return depths;
}

// Apply different layout algorithms
function applyLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  layoutType: LayoutType
): FlowNode[] {
  if (nodes.length === 0) return nodes;
  
  const spacing = { x: nodeWidth + 60, y: nodeHeight + 50 };
  const depths = calculateNodeDepths(nodes, edges);
  void depths; // Used in multiple layout cases
  
  switch (layoutType) {
    case 'default': {
      // Standard dagre top-to-bottom (wider spacing, left-aligned — visually distinct from centered)
      dagreGraph.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 90, align: 'UL' });
      nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
      edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
      dagre.layout(dagreGraph);
      return nodes.map(node => {
        const pos = dagreGraph.node(node.id);
        return { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
      });
    }
    
    case 'centered': {
      // Dagre layout, then center each rank horizontally
      dagreGraph.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70 });
      nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
      edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
      dagre.layout(dagreGraph);
      
      const positioned = nodes.map(node => {
        const pos = dagreGraph.node(node.id);
        return { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
      });
      
      // Group by Y position (rank) and center each rank
      const ranks = new Map<number, FlowNode[]>();
      positioned.forEach(node => {
        const y = Math.round(node.position.y / 10) * 10; // Round to avoid float issues
        const rank = ranks.get(y) || [];
        rank.push(node);
        ranks.set(y, rank);
      });
      
      let globalMinX = Infinity, globalMaxX = -Infinity;
      positioned.forEach(n => {
        globalMinX = Math.min(globalMinX, n.position.x);
        globalMaxX = Math.max(globalMaxX, n.position.x + nodeWidth);
      });
      const centerX = (globalMinX + globalMaxX) / 2;
      
      ranks.forEach(rankNodes => {
        const minX = Math.min(...rankNodes.map(n => n.position.x));
        const maxX = Math.max(...rankNodes.map(n => n.position.x + nodeWidth));
        const rankCenter = (minX + maxX) / 2;
        const offset = centerX - rankCenter;
        rankNodes.forEach(n => { n.position.x += offset; });
      });
      
      return positioned;
    }
    
    case 'horizontal': {
      // Left-to-right hierarchy
      dagreGraph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });
      nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
      edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
      dagre.layout(dagreGraph);
      return nodes.map(node => {
        const pos = dagreGraph.node(node.id);
        return { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
      });
    }
    
    case 'horizontal-row': {
      // All nodes in a single horizontal row
      return nodes.map((node, i) => ({
        ...node,
        position: { x: i * spacing.x, y: 0 }
      }));
    }
    
    case 'vertical-column': {
      // All nodes in a single vertical column
      return nodes.map((node, i) => ({
        ...node,
        position: { x: 0, y: i * spacing.y }
      }));
    }
    
    case 'diagonal': {
      // Nodes arranged diagonally
      return nodes.map((node, i) => ({
        ...node,
        position: { x: i * spacing.x * 0.7, y: i * spacing.y * 0.7 }
      }));
    }
    
    case 'circle': {
      // Nodes arranged in a circle
      const n = nodes.length;
      const radius = Math.max(150, n * 40);
      return nodes.map((node, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        return {
          ...node,
          position: {
            x: radius * Math.cos(angle) + radius,
            y: radius * Math.sin(angle) + radius
          }
        };
      });
    }
    
    case 'spiral': {
      // Nodes in a spiral pattern
      const a = 20; // Spiral tightness
      return nodes.map((node, i) => {
        const angle = i * 0.5;
        const r = a * angle;
        return {
          ...node,
          position: {
            x: r * Math.cos(angle) + 500,
            y: r * Math.sin(angle) + 500
          }
        };
      });
    }
    
    case 'grid': {
      // Nodes in a grid
      const cols = Math.ceil(Math.sqrt(nodes.length));
      return nodes.map((node, i) => ({
        ...node,
        position: {
          x: (i % cols) * spacing.x,
          y: Math.floor(i / cols) * spacing.y
        }
      }));
    }
    
    case 'radial': {
      // Radial layout from center based on depth
      const depthNodes = new Map<number, FlowNode[]>();
      nodes.forEach(node => {
        const d = depths.get(node.id) || 0;
        const arr = depthNodes.get(d) || [];
        arr.push(node);
        depthNodes.set(d, arr);
      });
      
      const result: FlowNode[] = [];
      depthNodes.forEach((nodesAtDepth, depth) => {
        const radius = depth === 0 ? 0 : 150 + depth * 120;
        const n = nodesAtDepth.length;
        nodesAtDepth.forEach((node, i) => {
          const angle = n === 1 ? 0 : (2 * Math.PI * i) / n - Math.PI / 2;
          result.push({
            ...node,
            position: {
              x: radius * Math.cos(angle) + 500,
              y: radius * Math.sin(angle) + 400
            }
          });
        });
      });
      return result;
    }
    
    case 'tree-centered': {
      // Centered tree - dagre with center alignment
      dagreGraph.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, align: 'UL' });
      nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
      edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
      dagre.layout(dagreGraph);
      
      const positioned = nodes.map(node => {
        const pos = dagreGraph.node(node.id);
        return { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
      });
      
      // Center the entire tree
      const minX = Math.min(...positioned.map(n => n.position.x));
      const maxX = Math.max(...positioned.map(n => n.position.x + nodeWidth));
      const offsetX = -minX + (500 - (maxX - minX) / 2);
      positioned.forEach(n => { n.position.x += offsetX; });
      
      return positioned;
    }
    
    case 'inverted': {
      // Bottom-to-top hierarchy
      dagreGraph.setGraph({ rankdir: 'BT', nodesep: 50, ranksep: 70 });
      nodes.forEach(node => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
      edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
      dagre.layout(dagreGraph);
      return nodes.map(node => {
        const pos = dagreGraph.node(node.id);
        return { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
      });
    }
    
    case 'wave': {
      // Sine wave pattern
      const amplitude = 100;
      const wavelength = 3;
      return nodes.map((node, i) => ({
        ...node,
        position: {
          x: i * spacing.x * 0.6,
          y: amplitude * Math.sin((i / wavelength) * Math.PI) + 300
        }
      }));
    }
    
    case 'diamond': {
      // Diamond shape arrangement
      const n = nodes.length;
      const half = Math.ceil(n / 2);
      return nodes.map((node, i) => {
        const row = i < half ? i : n - 1 - i;
        const col = i < half ? i : i - half;
        return {
          ...node,
          position: {
            x: row * spacing.x * 0.5 + 200,
            y: col * spacing.y + (i >= half ? half * spacing.y : 0)
          }
        };
      });
    }
    
    case 'hexagonal': {
      // Hexagonal grid pattern
      const cols = Math.ceil(Math.sqrt(nodes.length * 1.5));
      return nodes.map((node, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const offsetX = row % 2 === 1 ? spacing.x * 0.5 : 0;
        return {
          ...node,
          position: {
            x: col * spacing.x + offsetX,
            y: row * spacing.y * 0.85
          }
        };
      });
    }
    
    case 'zigzag': {
      // Alternating left-right pattern
      return nodes.map((node, i) => ({
        ...node,
        position: {
          x: (i % 2 === 0 ? 0 : spacing.x * 1.5),
          y: i * spacing.y * 0.6
        }
      }));
    }
    
    case 'scattered': {
      // Artistic scattered with some structure based on depth
      const seededRandom = (seed: number) => {
        const x = Math.sin(seed * 9999) * 10000;
        return x - Math.floor(x);
      };
      
      return nodes.map((node, i) => {
        const depth = depths.get(node.id) || 0;
        const baseY = depth * spacing.y * 1.2;
        const randomOffsetX = (seededRandom(i * 17) - 0.5) * 300;
        const randomOffsetY = (seededRandom(i * 31) - 0.5) * 80;
        return {
          ...node,
          position: {
            x: 400 + randomOffsetX + (i % 3 - 1) * 150,
            y: baseY + randomOffsetY
          }
        };
      });
    }
    
    case 'concentric': {
      // Concentric circles by depth level
      const depthNodes = new Map<number, FlowNode[]>();
      nodes.forEach(node => {
        const d = depths.get(node.id) || 0;
        const arr = depthNodes.get(d) || [];
        arr.push(node);
        depthNodes.set(d, arr);
      });
      
      const result: FlowNode[] = [];
      const centerX = 500, centerY = 400;
      
      depthNodes.forEach((nodesAtDepth, depth) => {
        const radius = 80 + depth * 140;
        const n = nodesAtDepth.length;
        const startAngle = -Math.PI / 2;
        
        nodesAtDepth.forEach((node, i) => {
          const angle = startAngle + (2 * Math.PI * i) / Math.max(n, 1);
          result.push({
            ...node,
            position: {
              x: centerX + radius * Math.cos(angle) - nodeWidth / 2,
              y: centerY + radius * Math.sin(angle) - nodeHeight / 2
            }
          });
        });
      });
      return result;
    }
    
    case 'columns-by-depth': {
      // Vertical columns, one per depth level
      const depthNodes = new Map<number, FlowNode[]>();
      nodes.forEach(node => {
        const d = depths.get(node.id) || 0;
        const arr = depthNodes.get(d) || [];
        arr.push(node);
        depthNodes.set(d, arr);
      });
      
      const result: FlowNode[] = [];
      depthNodes.forEach((nodesAtDepth, depth) => {
        nodesAtDepth.forEach((node, i) => {
          result.push({
            ...node,
            position: {
              x: depth * spacing.x,
              y: i * spacing.y
            }
          });
        });
      });
      return result;
    }
    
    case 'cascade': {
      // Cascading waterfall effect
      return nodes.map((node, i) => ({
        ...node,
        position: {
          x: (i % 5) * spacing.x * 0.3 + i * 30,
          y: i * spacing.y * 0.5
        }
      }));
    }
    
    default:
      return nodes;
  }
}

// ============================================
// End Layout Functions
// ============================================

// Premium glass theme - Light mode (clean whites and subtle accents)
const LIGHT_THEME = {
  canvasBg: 'linear-gradient(145deg, #ffffff 0%, #fafcfe 50%, #f8fafc 100%)',
  nodeSurface: 'rgba(247, 250, 252, 0.97)',
  nodeBorder: 'rgba(203, 213, 225, 0.5)',
  highlightColor: '#3b82f6',
  edgeColor: '#cbd5e1',
  glassShadow: '0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
  glassShadowSelected: '0 2px 8px rgba(59, 130, 246, 0.18), 0 4px 20px rgba(59, 130, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1)',
  textPrimary: '#334155',
  textSecondary: '#64748b',
  textHighlight: '#1e40af',
  panelBg: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.95) 100%)',
  panelBorder: 'rgba(226,232,240,0.8)',
  panelShadow: '0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(59,130,246,0.04)',
  inputBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
  inputBorder: '#e2e8f0',
  buttonBg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  buttonHover: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
};

// Premium dark theme - Deep blues and elegant contrast
const DARK_THEME = {
  canvasBg: 'linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
  nodeSurface: 'rgba(30, 41, 59, 0.95)',
  nodeBorder: 'rgba(71, 85, 105, 0.4)',
  highlightColor: '#60a5fa',
  edgeColor: 'rgba(100, 116, 139, 0.5)',
  glassShadow: '0 1px 4px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
  glassShadowSelected: '0 2px 8px rgba(96, 165, 250, 0.25), 0 4px 20px rgba(96, 165, 250, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textHighlight: '#93c5fd',
  panelBg: 'linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%)',
  panelBorder: 'rgba(71, 85, 105, 0.4)',
  panelShadow: '0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2)',
  inputBg: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
  inputBorder: 'rgba(71, 85, 105, 0.4)',
  buttonBg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  buttonHover: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
};

// Legacy constants for backward compatibility (light mode) - keeping HIGHLIGHT_COLOR and EDGE_COLOR as they may be used
const HIGHLIGHT_COLOR = LIGHT_THEME.highlightColor;
const EDGE_COLOR = LIGHT_THEME.edgeColor;

// ============================================
// Diagram Style Themes - 15 Polished Themes
// ============================================

type DiagramThemeId = 
  | 'default'
  | 'ocean'
  | 'sunset'
  | 'forest'
  | 'lavender'
  | 'rose'
  | 'midnight'
  | 'arctic'
  | 'coral'
  | 'mint'
  | 'bronze'
  | 'neon'
  | 'monochrome'
  | 'vintage'
  | 'aurora';

interface DiagramTheme {
  id: DiagramThemeId;
  name: string;
  description: string;
  node: {
    surface: string;
    surfaceHighlight: string;
    border: string;
    borderHighlight: string;
    shadow: string;
    shadowHighlight: string;
    textPrimary: string;
    textSecondary: string;
    textHighlight: string;
    accent: string;
  };
  edge: {
    color: string;
    highlightColor: string;
  };
  group: {
    fill: string;
    stroke: string;
    label: string;
  };
}

const DIAGRAM_THEMES: Record<DiagramThemeId, DiagramTheme> = {
  // Default - Keep exactly as current (clean slate/white)
  default: {
    id: 'default',
    name: 'Default',
    description: 'Clean and professional',
    node: {
      surface: 'rgba(247, 250, 252, 0.97)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.95) 100%)',
      border: 'rgba(203, 213, 225, 0.5)',
      borderHighlight: 'rgba(59, 130, 246, 0.4)',
      shadow: '0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
      shadowHighlight: '0 2px 8px rgba(59, 130, 246, 0.18), 0 4px 20px rgba(59, 130, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1)',
      textPrimary: '#334155',
      textSecondary: '#64748b',
      textHighlight: '#1e40af',
      accent: '#3b82f6',
    },
    edge: {
      color: '#cbd5e1',
      highlightColor: '#3b82f6',
    },
    group: {
      fill: 'rgba(59, 130, 246, 0.04)',
      stroke: 'rgba(59, 130, 246, 0.15)',
      label: 'rgba(59, 130, 246, 0.7)',
    },
  },
  
  // Ocean - Deep sophisticated blues
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep sophisticated blues',
    node: {
      surface: 'linear-gradient(145deg, rgba(240, 249, 255, 0.98) 0%, rgba(224, 242, 254, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(186, 230, 253, 0.98) 0%, rgba(125, 211, 252, 0.9) 100%)',
      border: 'rgba(14, 165, 233, 0.25)',
      borderHighlight: 'rgba(2, 132, 199, 0.6)',
      shadow: '0 2px 8px rgba(14, 165, 233, 0.08), 0 4px 16px rgba(14, 165, 233, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      shadowHighlight: '0 4px 16px rgba(2, 132, 199, 0.2), 0 8px 24px rgba(14, 165, 233, 0.12)',
      textPrimary: '#0c4a6e',
      textSecondary: '#0369a1',
      textHighlight: '#0284c7',
      accent: '#0ea5e9',
    },
    edge: {
      color: 'rgba(56, 189, 248, 0.5)',
      highlightColor: '#0284c7',
    },
    group: {
      fill: 'rgba(14, 165, 233, 0.06)',
      stroke: 'rgba(14, 165, 233, 0.2)',
      label: 'rgba(3, 105, 161, 0.8)',
    },
  },
  
  // Sunset - Warm oranges and corals
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm golden hour tones',
    node: {
      surface: 'linear-gradient(145deg, rgba(255, 251, 235, 0.98) 0%, rgba(254, 243, 199, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(253, 230, 138, 0.95) 0%, rgba(251, 191, 36, 0.85) 100%)',
      border: 'rgba(245, 158, 11, 0.3)',
      borderHighlight: 'rgba(217, 119, 6, 0.6)',
      shadow: '0 2px 8px rgba(245, 158, 11, 0.1), 0 4px 16px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      shadowHighlight: '0 4px 16px rgba(217, 119, 6, 0.2), 0 8px 24px rgba(245, 158, 11, 0.15)',
      textPrimary: '#78350f',
      textSecondary: '#92400e',
      textHighlight: '#b45309',
      accent: '#f59e0b',
    },
    edge: {
      color: 'rgba(251, 191, 36, 0.5)',
      highlightColor: '#d97706',
    },
    group: {
      fill: 'rgba(245, 158, 11, 0.06)',
      stroke: 'rgba(245, 158, 11, 0.2)',
      label: 'rgba(146, 64, 14, 0.8)',
    },
  },
  
  // Forest - Natural earthy greens
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Natural earthy greens',
    node: {
      surface: 'linear-gradient(145deg, rgba(240, 253, 244, 0.98) 0%, rgba(220, 252, 231, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(187, 247, 208, 0.95) 0%, rgba(134, 239, 172, 0.88) 100%)',
      border: 'rgba(34, 197, 94, 0.25)',
      borderHighlight: 'rgba(22, 163, 74, 0.55)',
      shadow: '0 2px 8px rgba(34, 197, 94, 0.08), 0 4px 16px rgba(34, 197, 94, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      shadowHighlight: '0 4px 16px rgba(22, 163, 74, 0.18), 0 8px 24px rgba(34, 197, 94, 0.12)',
      textPrimary: '#14532d',
      textSecondary: '#166534',
      textHighlight: '#15803d',
      accent: '#22c55e',
    },
    edge: {
      color: 'rgba(74, 222, 128, 0.5)',
      highlightColor: '#16a34a',
    },
    group: {
      fill: 'rgba(34, 197, 94, 0.06)',
      stroke: 'rgba(34, 197, 94, 0.2)',
      label: 'rgba(22, 101, 52, 0.8)',
    },
  },
  
  // Lavender - Elegant soft purples
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    description: 'Elegant soft purples',
    node: {
      surface: 'linear-gradient(145deg, rgba(250, 245, 255, 0.98) 0%, rgba(243, 232, 255, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(233, 213, 255, 0.95) 0%, rgba(216, 180, 254, 0.88) 100%)',
      border: 'rgba(168, 85, 247, 0.25)',
      borderHighlight: 'rgba(147, 51, 234, 0.55)',
      shadow: '0 2px 8px rgba(168, 85, 247, 0.08), 0 4px 16px rgba(168, 85, 247, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      shadowHighlight: '0 4px 16px rgba(147, 51, 234, 0.18), 0 8px 24px rgba(168, 85, 247, 0.12)',
      textPrimary: '#3b0764',
      textSecondary: '#581c87',
      textHighlight: '#7c3aed',
      accent: '#a855f7',
    },
    edge: {
      color: 'rgba(192, 132, 252, 0.5)',
      highlightColor: '#9333ea',
    },
    group: {
      fill: 'rgba(168, 85, 247, 0.06)',
      stroke: 'rgba(168, 85, 247, 0.2)',
      label: 'rgba(88, 28, 135, 0.8)',
    },
  },
  
  // Rose - Refined feminine pinks
  rose: {
    id: 'rose',
    name: 'Rose',
    description: 'Refined feminine pinks',
    node: {
      surface: 'linear-gradient(145deg, rgba(255, 241, 242, 0.98) 0%, rgba(254, 226, 226, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(253, 205, 211, 0.95) 0%, rgba(251, 164, 175, 0.88) 100%)',
      border: 'rgba(244, 63, 94, 0.25)',
      borderHighlight: 'rgba(225, 29, 72, 0.55)',
      shadow: '0 2px 8px rgba(244, 63, 94, 0.08), 0 4px 16px rgba(244, 63, 94, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      shadowHighlight: '0 4px 16px rgba(225, 29, 72, 0.18), 0 8px 24px rgba(244, 63, 94, 0.12)',
      textPrimary: '#4c0519',
      textSecondary: '#9f1239',
      textHighlight: '#be123c',
      accent: '#f43f5e',
    },
    edge: {
      color: 'rgba(251, 113, 133, 0.5)',
      highlightColor: '#e11d48',
    },
    group: {
      fill: 'rgba(244, 63, 94, 0.06)',
      stroke: 'rgba(244, 63, 94, 0.2)',
      label: 'rgba(159, 18, 57, 0.8)',
    },
  },
  
  // Midnight - Premium dark elegance (for light mode as contrast)
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Premium dark elegance',
    node: {
      surface: 'linear-gradient(145deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(51, 65, 85, 0.98) 0%, rgba(71, 85, 105, 0.9) 100%)',
      border: 'rgba(100, 116, 139, 0.4)',
      borderHighlight: 'rgba(148, 163, 184, 0.6)',
      shadow: '0 2px 8px rgba(0, 0, 0, 0.25), 0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      shadowHighlight: '0 4px 16px rgba(148, 163, 184, 0.15), 0 8px 24px rgba(0, 0, 0, 0.25)',
      textPrimary: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textHighlight: '#e2e8f0',
      accent: '#94a3b8',
    },
    edge: {
      color: 'rgba(100, 116, 139, 0.6)',
      highlightColor: '#94a3b8',
    },
    group: {
      fill: 'rgba(71, 85, 105, 0.15)',
      stroke: 'rgba(100, 116, 139, 0.35)',
      label: 'rgba(203, 213, 225, 0.9)',
    },
  },
  
  // Arctic - Crisp icy whites and blues
  arctic: {
    id: 'arctic',
    name: 'Arctic',
    description: 'Crisp icy whites',
    node: {
      surface: 'linear-gradient(145deg, rgba(255, 255, 255, 0.99) 0%, rgba(241, 245, 249, 0.97) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(241, 245, 249, 0.98) 0%, rgba(226, 232, 240, 0.95) 100%)',
      border: 'rgba(148, 163, 184, 0.3)',
      borderHighlight: 'rgba(100, 116, 139, 0.5)',
      shadow: '0 1px 3px rgba(148, 163, 184, 0.1), 0 4px 12px rgba(148, 163, 184, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
      shadowHighlight: '0 2px 8px rgba(100, 116, 139, 0.15), 0 6px 20px rgba(148, 163, 184, 0.1)',
      textPrimary: '#334155',
      textSecondary: '#64748b',
      textHighlight: '#475569',
      accent: '#64748b',
    },
    edge: {
      color: 'rgba(148, 163, 184, 0.4)',
      highlightColor: '#64748b',
    },
    group: {
      fill: 'rgba(226, 232, 240, 0.25)',
      stroke: 'rgba(148, 163, 184, 0.3)',
      label: 'rgba(71, 85, 105, 0.8)',
    },
  },
  
  // Coral - Vibrant tropical energy
  coral: {
    id: 'coral',
    name: 'Coral',
    description: 'Vibrant tropical energy',
    node: {
      surface: 'linear-gradient(145deg, rgba(255, 247, 237, 0.98) 0%, rgba(255, 237, 213, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(254, 215, 170, 0.95) 0%, rgba(253, 186, 116, 0.88) 100%)',
      border: 'rgba(249, 115, 22, 0.28)',
      borderHighlight: 'rgba(234, 88, 12, 0.58)',
      shadow: '0 2px 8px rgba(249, 115, 22, 0.1), 0 4px 16px rgba(249, 115, 22, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      shadowHighlight: '0 4px 16px rgba(234, 88, 12, 0.2), 0 8px 24px rgba(249, 115, 22, 0.15)',
      textPrimary: '#7c2d12',
      textSecondary: '#9a3412',
      textHighlight: '#c2410c',
      accent: '#f97316',
    },
    edge: {
      color: 'rgba(251, 146, 60, 0.5)',
      highlightColor: '#ea580c',
    },
    group: {
      fill: 'rgba(249, 115, 22, 0.06)',
      stroke: 'rgba(249, 115, 22, 0.2)',
      label: 'rgba(154, 52, 18, 0.8)',
    },
  },
  
  // Mint - Fresh clean teals
  mint: {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh clean teals',
    node: {
      surface: 'linear-gradient(145deg, rgba(240, 253, 250, 0.98) 0%, rgba(204, 251, 241, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(153, 246, 228, 0.95) 0%, rgba(94, 234, 212, 0.88) 100%)',
      border: 'rgba(20, 184, 166, 0.25)',
      borderHighlight: 'rgba(13, 148, 136, 0.55)',
      shadow: '0 2px 8px rgba(20, 184, 166, 0.08), 0 4px 16px rgba(20, 184, 166, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      shadowHighlight: '0 4px 16px rgba(13, 148, 136, 0.18), 0 8px 24px rgba(20, 184, 166, 0.12)',
      textPrimary: '#134e4a',
      textSecondary: '#115e59',
      textHighlight: '#0f766e',
      accent: '#14b8a6',
    },
    edge: {
      color: 'rgba(45, 212, 191, 0.5)',
      highlightColor: '#0d9488',
    },
    group: {
      fill: 'rgba(20, 184, 166, 0.06)',
      stroke: 'rgba(20, 184, 166, 0.2)',
      label: 'rgba(17, 94, 89, 0.8)',
    },
  },
  
  // Bronze - Sophisticated metallic warmth
  bronze: {
    id: 'bronze',
    name: 'Bronze',
    description: 'Sophisticated metallic',
    node: {
      surface: 'linear-gradient(145deg, rgba(254, 252, 251, 0.98) 0%, rgba(255, 247, 237, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(253, 230, 215, 0.95) 0%, rgba(251, 207, 178, 0.88) 100%)',
      border: 'rgba(180, 83, 9, 0.22)',
      borderHighlight: 'rgba(146, 64, 14, 0.5)',
      shadow: '0 2px 8px rgba(180, 83, 9, 0.08), 0 4px 16px rgba(180, 83, 9, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      shadowHighlight: '0 4px 16px rgba(146, 64, 14, 0.18), 0 8px 24px rgba(180, 83, 9, 0.12)',
      textPrimary: '#451a03',
      textSecondary: '#78350f',
      textHighlight: '#92400e',
      accent: '#b45309',
    },
    edge: {
      color: 'rgba(217, 119, 6, 0.45)',
      highlightColor: '#92400e',
    },
    group: {
      fill: 'rgba(180, 83, 9, 0.05)',
      stroke: 'rgba(180, 83, 9, 0.18)',
      label: 'rgba(120, 53, 15, 0.8)',
    },
  },
  
  // Neon - Bold modern vibrancy
  neon: {
    id: 'neon',
    name: 'Neon',
    description: 'Bold modern vibrancy',
    node: {
      surface: 'linear-gradient(145deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(30, 58, 138, 0.95) 0%, rgba(37, 99, 235, 0.85) 100%)',
      border: 'rgba(168, 85, 247, 0.4)',
      borderHighlight: 'rgba(236, 72, 153, 0.7)',
      shadow: '0 2px 12px rgba(168, 85, 247, 0.2), 0 4px 20px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      shadowHighlight: '0 4px 20px rgba(236, 72, 153, 0.35), 0 8px 32px rgba(168, 85, 247, 0.25)',
      textPrimary: '#f0abfc',
      textSecondary: '#c4b5fd',
      textHighlight: '#f472b6',
      accent: '#ec4899',
    },
    edge: {
      color: 'rgba(192, 132, 252, 0.6)',
      highlightColor: '#f472b6',
    },
    group: {
      fill: 'rgba(139, 92, 246, 0.1)',
      stroke: 'rgba(168, 85, 247, 0.35)',
      label: 'rgba(196, 181, 253, 0.9)',
    },
  },
  
  // Monochrome - Timeless grayscale elegance
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Timeless grayscale',
    node: {
      surface: 'linear-gradient(145deg, rgba(250, 250, 250, 0.98) 0%, rgba(245, 245, 245, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(229, 229, 229, 0.98) 0%, rgba(212, 212, 212, 0.92) 100%)',
      border: 'rgba(115, 115, 115, 0.25)',
      borderHighlight: 'rgba(64, 64, 64, 0.5)',
      shadow: '0 1px 4px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 1)',
      shadowHighlight: '0 2px 10px rgba(0, 0, 0, 0.15), 0 6px 20px rgba(0, 0, 0, 0.1)',
      textPrimary: '#262626',
      textSecondary: '#525252',
      textHighlight: '#171717',
      accent: '#404040',
    },
    edge: {
      color: 'rgba(163, 163, 163, 0.5)',
      highlightColor: '#525252',
    },
    group: {
      fill: 'rgba(163, 163, 163, 0.08)',
      stroke: 'rgba(163, 163, 163, 0.25)',
      label: 'rgba(82, 82, 82, 0.85)',
    },
  },
  
  // Vintage - Warm nostalgic sepia
  vintage: {
    id: 'vintage',
    name: 'Vintage',
    description: 'Warm nostalgic sepia',
    node: {
      surface: 'linear-gradient(145deg, rgba(254, 252, 247, 0.98) 0%, rgba(253, 246, 227, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(250, 240, 205, 0.95) 0%, rgba(245, 225, 175, 0.88) 100%)',
      border: 'rgba(161, 130, 90, 0.28)',
      borderHighlight: 'rgba(133, 100, 60, 0.52)',
      shadow: '0 2px 8px rgba(120, 85, 40, 0.08), 0 4px 16px rgba(120, 85, 40, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      shadowHighlight: '0 4px 16px rgba(133, 100, 60, 0.15), 0 8px 24px rgba(120, 85, 40, 0.1)',
      textPrimary: '#57400f',
      textSecondary: '#78552a',
      textHighlight: '#8b6914',
      accent: '#a16207',
    },
    edge: {
      color: 'rgba(180, 145, 95, 0.45)',
      highlightColor: '#92400e',
    },
    group: {
      fill: 'rgba(180, 145, 95, 0.06)',
      stroke: 'rgba(180, 145, 95, 0.2)',
      label: 'rgba(120, 85, 42, 0.8)',
    },
  },
  
  // Aurora - Magical northern lights
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Magical northern lights',
    node: {
      surface: 'linear-gradient(145deg, rgba(236, 254, 255, 0.98) 0%, rgba(240, 253, 250, 0.95) 100%)',
      surfaceHighlight: 'linear-gradient(135deg, rgba(167, 243, 208, 0.92) 0%, rgba(134, 239, 172, 0.85) 50%, rgba(94, 234, 212, 0.88) 100%)',
      border: 'rgba(6, 182, 212, 0.28)',
      borderHighlight: 'rgba(16, 185, 129, 0.55)',
      shadow: '0 2px 10px rgba(6, 182, 212, 0.1), 0 4px 18px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      shadowHighlight: '0 4px 18px rgba(16, 185, 129, 0.2), 0 8px 28px rgba(6, 182, 212, 0.15)',
      textPrimary: '#134e4a',
      textSecondary: '#047857',
      textHighlight: '#059669',
      accent: '#10b981',
    },
    edge: {
      color: 'rgba(45, 212, 191, 0.5)',
      highlightColor: '#10b981',
    },
    group: {
      fill: 'rgba(16, 185, 129, 0.06)',
      stroke: 'rgba(6, 182, 212, 0.22)',
      label: 'rgba(4, 120, 87, 0.8)',
    },
  },
};

const DIAGRAM_THEME_ORDER: DiagramThemeId[] = [
  'default', 'ocean', 'sunset', 'forest', 'lavender', 'rose',
  'midnight', 'arctic', 'coral', 'mint', 'bronze', 'neon',
  'monochrome', 'vintage', 'aurora'
];

// Helper to get current theme
const getTheme = (darkMode: boolean) => darkMode ? DARK_THEME : LIGHT_THEME;

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
  useViewport,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type NodeData = {
  label: string;
  color: string;
  category: string;

  // Notion page ID (for fetching page content / documentation)
  notionPageId?: string;
  
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
  
  // Visual grouping
  grouping?: string;
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
  grouping?: string;
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
    darkMode?: boolean;
    diagramTheme?: DiagramThemeId;
  };
  const isHighlighted = data.isHighlighted === true;
  const isEditing = data.editingNoteNodeId === props.id;
  const isDark = data.darkMode === true;
  const theme = getTheme(isDark);
  const diagramTheme = DIAGRAM_THEMES[data.diagramTheme || 'default'];
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
  
  // Premium glass styling - theme aware with diagram theme support
  // In dark mode, use dark theme. In light mode, apply diagram theme styles
  const background = isDark
    ? (isHighlighted 
        ? 'linear-gradient(135deg, rgba(30, 58, 95, 0.98) 0%, rgba(23, 37, 84, 0.95) 100%)' 
        : theme.nodeSurface)
    : (isHighlighted ? diagramTheme.node.surfaceHighlight : diagramTheme.node.surface);
  const textColor = isDark
    ? (isHighlighted ? theme.textHighlight : theme.textPrimary)
    : (isHighlighted ? diagramTheme.node.textHighlight : diagramTheme.node.textPrimary);
  const borderStyle = isDark
    ? (isHighlighted 
        ? '1.5px solid rgba(96, 165, 250, 0.5)' 
        : `1px solid ${theme.nodeBorder}`)
    : (isHighlighted 
        ? `1.5px solid ${diagramTheme.node.borderHighlight}` 
        : `1px solid ${diagramTheme.node.border}`);
  const shadow = isDark
    ? (isHighlighted ? theme.glassShadowSelected : theme.glassShadow)
    : (isHighlighted ? diagramTheme.node.shadowHighlight : diagramTheme.node.shadow);

  // Checkbox button toggles selection
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onToggleSelect) {
      data.onToggleSelect(props.id);
    }
  };

  // Clicking anywhere on the node body opens focus mode
  const handleNodeBodyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onInfoClick) {
      data.onInfoClick(props.id);
    }
  };

  // Note area click does nothing special — clicks bubble up to the outer div which opens focus mode

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
      onClick={handleNodeBodyClick}
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
          background: isHighlighted 
            ? (isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.15)')
            : (isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.08)'),
          color: isHighlighted 
            ? theme.highlightColor 
            : theme.textSecondary,
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
          e.currentTarget.style.background = isDark ? 'rgba(96, 165, 250, 0.25)' : 'rgba(59, 130, 246, 0.2)';
          e.currentTarget.style.color = theme.highlightColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isHighlighted 
            ? (isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.15)')
            : (isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.08)');
          e.currentTarget.style.color = isHighlighted ? theme.highlightColor : theme.textSecondary;
        }}
        title={isHighlighted ? 'Deselect node' : 'Select node'}
      >
        {isHighlighted ? '✓' : '○'}
      </button>
      {/* Title with hover highlight */}
      <div 
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
          e.currentTarget.style.background = isDark ? 'rgba(96, 165, 250, 0.15)' : 'rgba(59, 130, 246, 0.1)';
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
            borderTop: isDark ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid rgba(100, 116, 139, 0.1)',
            paddingTop: 4,
            fontSize: 9,
            opacity: 0.5,
            fontStyle: 'italic',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: theme.textSecondary,
          }}
        >
          {firstLine}
        </div>
      )}
      
      {/* Inline note area - only visible when highlighted */}
      {isHighlighted && (
        <div 
          style={{ 
            marginTop: 8,
            borderTop: isDark ? '1px solid rgba(96, 165, 250, 0.2)' : '1px solid rgba(59, 130, 246, 0.15)',
            paddingTop: 6,
          }}
        >
          {hasNote ? (
            <div
              style={{
                fontSize: 10,
                opacity: 0.6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {firstLine}
            </div>
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

// Unified glass style for all group rectangles
const GLASS_GROUP_STYLE = {
  fill: 'rgba(96, 165, 250, 0.06)',    // Subtle blue with low opacity
  stroke: 'rgba(96, 165, 250, 0.18)',  // Soft blue border
  label: 'rgba(147, 197, 253, 0.85)',  // Light blue for text in dark mode
};

// Component to render grouping rectangles behind nodes
function NodeGroupingOverlay({ nodes, diagramTheme, darkMode }: { nodes: Node[]; diagramTheme: DiagramTheme; darkMode: boolean }) {
  const { x, y, zoom } = useViewport();
  
  // Get group style from diagram theme (use default glass style in dark mode)
  const groupStyle = darkMode ? GLASS_GROUP_STYLE : diagramTheme.group;
  
  // Calculate bounding boxes for each group
  const groupBounds = useMemo(() => {
    const groups: Record<string, { nodes: Node[]; minX: number; maxX: number; minY: number; maxY: number }> = {};
    
    // Collect nodes by group
    nodes.forEach((node) => {
      const grouping = (node.data as NodeData)?.grouping;
      if (!grouping || node.hidden) return;
      
      // Use consistent node dimensions matching the dagre layout
      // Add extra height buffer for nodes with content (like notes)
      const nodeW = 240;
      const nodeH = 100; // Increased to account for potential notes/content
      
      if (!groups[grouping]) {
        groups[grouping] = {
          nodes: [],
          minX: node.position.x,
          maxX: node.position.x + nodeW,
          minY: node.position.y,
          maxY: node.position.y + nodeH,
        };
      }
      
      groups[grouping].nodes.push(node);
      groups[grouping].minX = Math.min(groups[grouping].minX, node.position.x);
      groups[grouping].maxX = Math.max(groups[grouping].maxX, node.position.x + nodeW);
      groups[grouping].minY = Math.min(groups[grouping].minY, node.position.y);
      groups[grouping].maxY = Math.max(groups[grouping].maxY, node.position.y + nodeH);
    });
    
    return groups;
  }, [nodes]);
  
  // Calculate non-overlapping rectangle bounds with adjusted padding
  const adjustedBounds = useMemo(() => {
    const basePadding = 30;
    const labelHeight = 28;
    const minGap = 12; // Minimum gap between rectangles for cleaner spacing
    
    // Convert to rectangle format with padding
    const rects: Array<{
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      originalBounds: typeof groupBounds[string];
    }> = Object.entries(groupBounds).map(([name, bounds]) => ({
      name,
      x: bounds.minX - basePadding,
      y: bounds.minY - basePadding - labelHeight,
      width: bounds.maxX - bounds.minX + basePadding * 2,
      height: bounds.maxY - bounds.minY + basePadding * 2 + labelHeight,
      originalBounds: bounds,
    }));
    
    // Check if two rectangles overlap
    const rectsOverlap = (r1: typeof rects[0], r2: typeof rects[0]) => {
      return !(r1.x + r1.width + minGap <= r2.x || 
               r2.x + r2.width + minGap <= r1.x || 
               r1.y + r1.height + minGap <= r2.y || 
               r2.y + r2.height + minGap <= r1.y);
    };
    
    // Shrink rectangles to eliminate overlap
    // We'll reduce padding on the overlapping sides
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const r1 = rects[i];
        const r2 = rects[j];
        
        if (!rectsOverlap(r1, r2)) continue;
        
        // Calculate overlap amounts
        const overlapLeft = r1.x + r1.width - r2.x;
        const overlapRight = r2.x + r2.width - r1.x;
        const overlapTop = r1.y + r1.height - r2.y;
        const overlapBottom = r2.y + r2.height - r1.y;
        
        // Find the minimum adjustment needed (horizontal or vertical)
        const horizontalOverlap = Math.min(overlapLeft, overlapRight);
        const verticalOverlap = Math.min(overlapTop, overlapBottom);
        
        // Choose the smaller overlap to resolve
        if (horizontalOverlap < verticalOverlap && horizontalOverlap > 0) {
          // Resolve horizontal overlap
          const adjustment = (horizontalOverlap + minGap) / 2;
          if (r1.x < r2.x) {
            // r1 is to the left of r2
            const maxShrink1 = r1.width - (r1.originalBounds.maxX - r1.originalBounds.minX + 8);
            const maxShrink2 = r2.width - (r2.originalBounds.maxX - r2.originalBounds.minX + 8);
            const shrink1 = Math.min(adjustment, maxShrink1);
            const shrink2 = Math.min(adjustment, maxShrink2);
            r1.width -= shrink1;
            r2.x += shrink2;
            r2.width -= shrink2;
          } else {
            // r2 is to the left of r1
            const maxShrink1 = r1.width - (r1.originalBounds.maxX - r1.originalBounds.minX + 8);
            const maxShrink2 = r2.width - (r2.originalBounds.maxX - r2.originalBounds.minX + 8);
            const shrink1 = Math.min(adjustment, maxShrink1);
            const shrink2 = Math.min(adjustment, maxShrink2);
            r1.x += shrink1;
            r1.width -= shrink1;
            r2.width -= shrink2;
          }
        } else if (verticalOverlap > 0) {
          // Resolve vertical overlap
          const adjustment = (verticalOverlap + minGap) / 2;
          if (r1.y < r2.y) {
            // r1 is above r2
            const maxShrink1 = r1.height - (r1.originalBounds.maxY - r1.originalBounds.minY + 8);
            const maxShrink2 = r2.height - (r2.originalBounds.maxY - r2.originalBounds.minY + labelHeight + 8);
            const shrink1 = Math.min(adjustment, maxShrink1);
            const shrink2 = Math.min(adjustment, maxShrink2);
            r1.height -= shrink1;
            r2.y += shrink2;
            r2.height -= shrink2;
          } else {
            // r2 is above r1
            const maxShrink1 = r1.height - (r1.originalBounds.maxY - r1.originalBounds.minY + labelHeight + 8);
            const maxShrink2 = r2.height - (r2.originalBounds.maxY - r2.originalBounds.minY + 8);
            const shrink1 = Math.min(adjustment, maxShrink1);
            const shrink2 = Math.min(adjustment, maxShrink2);
            r1.y += shrink1;
            r1.height -= shrink1;
            r2.height -= shrink2;
          }
        }
      }
    }
    
    return rects;
  }, [groupBounds]);
  
  if (Object.keys(groupBounds).length === 0) return null;
  
  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: -1, // Ensure groups render BEHIND nodes
      }}
    >
      <defs>
        {/* Shared filter for subtle glow */}
        <filter id="groupGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {adjustedBounds.map((rect) => (
          <g key={rect.name}>
            {/* Premium glass gradient - uses theme colors */}
            <defs>
              <linearGradient id={`glass-gradient-${rect.name.replace(/\s+/g, '-')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.12)" />
                <stop offset="50%" stopColor="rgba(255, 255, 255, 0.02)" />
                <stop offset="100%" stopColor={groupStyle.fill} />
              </linearGradient>
              <linearGradient id={`border-gradient-${rect.name.replace(/\s+/g, '-')}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={groupStyle.stroke} />
                <stop offset="50%" stopColor={groupStyle.fill} />
                <stop offset="100%" stopColor={groupStyle.stroke} />
              </linearGradient>
            </defs>
            {/* Outer glow layer */}
            <rect
              x={rect.x - 1}
              y={rect.y - 1}
              width={rect.width + 2}
              height={rect.height + 2}
              rx={18}
              ry={18}
              fill="none"
              stroke={groupStyle.fill}
              strokeWidth={3}
            />
            {/* Main background with glass gradient */}
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={16}
              ry={16}
              fill={`url(#glass-gradient-${rect.name.replace(/\s+/g, '-')})`}
              stroke={`url(#border-gradient-${rect.name.replace(/\s+/g, '-')})`}
              strokeWidth={1}
            />
            {/* Top highlight for glass effect */}
            <rect
              x={rect.x + 2}
              y={rect.y + 2}
              width={rect.width - 4}
              height={Math.min(rect.height * 0.4, 40)}
              rx={14}
              ry={14}
              fill="url(#glass-top-highlight)"
              opacity={0.6}
            />
            {/* Inner border for depth */}
            <rect
              x={rect.x + 1}
              y={rect.y + 1}
              width={rect.width - 2}
              height={rect.height - 2}
              rx={15}
              ry={15}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={0.5}
            />
            {/* Group label with subtle styling */}
            <text
              x={rect.x + 14}
              y={rect.y + 20}
              fill={groupStyle.label}
              fontSize={10}
              fontWeight={600}
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              style={{ letterSpacing: '0.04em', textTransform: 'uppercase' } as React.CSSProperties}
              opacity={0.9}
            >
              {rect.name}
            </text>
          </g>
        ))}
        {/* Shared gradient definitions */}
        <defs>
          <linearGradient id="glass-top-highlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.15)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>
        </defs>
      </g>
    </svg>
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
  fav?: boolean; // Favourite flag
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

  // Favourite path IDs - stored independently in localStorage for reliable persistence
  const [favouritePathIds, setFavouritePathIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('pathFavourites') || '{}');
      return new Set(Object.keys(stored));
    } catch {
      return new Set();
    }
  });

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
  // Separate archived view mode for path manager focus window only
  const [focusViewMode, setFocusViewMode] = useState<'folder' | 'alpha' | 'latest' | 'priority' | 'archived'>('folder');
  
  // Multi-select state for path manager focus window
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [lastClickedPathId, setLastClickedPathId] = useState<string | null>(null);
  const [_isDraggingSelected, setIsDraggingSelected] = useState(false);
  const [draggedPathIds, setDraggedPathIds] = useState<string[]>([]);
  
  // Track last updated timestamps for each path (pathId -> timestamp)
  const [pathLastUpdated, setPathLastUpdated] = useState<Record<string, number>>({});
  
  // Panel position and size state for draggable/resizable panels
  const [leftPanelPos, setLeftPanelPos] = useState({ x: 20, y: 20 });
  const [leftPanelSize, setLeftPanelSize] = useState({ width: 390, height: 700 });
  const [notesPathName, setNotesPathName] = useState<string | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState<'left' | 'info' | null>(null);
  const [resizeEdge, setResizeEdge] = useState<{ panel: 'left' | 'info'; edge: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, width: 0, height: 0, x: 0, y: 0 });
  
  // Inline note editing state
  const [editingNoteNodeId, setEditingNoteNodeId] = useState<string | null>(null);
  
  // Path-level notes state
  const [pathNotes, setPathNotes] = useState<Record<string, string>>({}); // pathId -> notes
  
  // Audio notes state (arrays of URLs for multiple recordings)
  const [pathAudioUrls, setPathAudioUrls] = useState<Record<string, string[]>>({}); // pathId -> array of audio URLs
  const [nodePathAudioUrls, setNodePathAudioUrls] = useState<Record<string, Record<string, string[]>>>({}); // pathId -> nodeId -> array of audio URLs
  
  // Track newly created path for auto-edit mode
  const [autoEditPathId, setAutoEditPathId] = useState<string | null>(null);
  
  // Layout cycling state
  const [currentLayoutType, setCurrentLayoutType] = useState<LayoutType>('centered');

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
  const pathNotesEditorRef = useRef<HTMLDivElement | null>(null); // Ref for path notes in focus mode
  const nodeNotesRefs = useRef<Record<string, HTMLDivElement | null>>({}); // Refs for node notes in focus mode
  const focusModeInitialized = useRef(false); // Track if focus mode editor has been initialized
  const mainEditorInitialized = useRef<string | null>(null); // Track which node's content is loaded in main editor
  const updatePathNodesCallbackRef = useRef<((pathId: string, pathName: string, nodeIds: Set<string>) => void) | null>(null);
  const [highlightedFolderId, setHighlightedFolderId] = useState<string | null>(null);

  // Notion page content for the documentation panel (right side of focus mode)
  const [notionPageBlocks, setNotionPageBlocks] = useState<unknown[]>([]);
  const [notionPageLoading, setNotionPageLoading] = useState(false);
  const [notionPageError, setNotionPageError] = useState<string | null>(null);
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage for saved preference
    const saved = localStorage.getItem('cinaps-dark-mode');
    return saved === 'true';
  });
  const [hideGroups, setHideGroups] = useState(() => {
    const saved = localStorage.getItem('cinaps-hide-groups');
    return saved === 'true';
  });
  const [hideConnectors, setHideConnectors] = useState(() => {
    const saved = localStorage.getItem('cinaps-hide-connectors');
    return saved === 'true';
  });
  const [diagramTheme, setDiagramTheme] = useState<DiagramThemeId>(() => {
    const saved = localStorage.getItem('cinaps-diagram-theme');
    return (saved && saved in DIAGRAM_THEMES) ? saved as DiagramThemeId : 'default';
  });
  
  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem('cinaps-dark-mode', String(darkMode));
  }, [darkMode]);
  
  // Persist hide groups preference
  useEffect(() => {
    localStorage.setItem('cinaps-hide-groups', String(hideGroups));
  }, [hideGroups]);
  
  // Persist hide connectors preference
  useEffect(() => {
    localStorage.setItem('cinaps-hide-connectors', String(hideConnectors));
  }, [hideConnectors]);
  
  // Persist diagram theme preference
  useEffect(() => {
    localStorage.setItem('cinaps-diagram-theme', diagramTheme);
  }, [diagramTheme]);
  
  // Get current diagram theme
  const currentDiagramTheme = DIAGRAM_THEMES[diagramTheme];
  
  // Cycle to next diagram theme
  const cycleDiagramTheme = useCallback(() => {
    setDiagramTheme(current => {
      const currentIndex = DIAGRAM_THEME_ORDER.indexOf(current);
      const nextIndex = (currentIndex + 1) % DIAGRAM_THEME_ORDER.length;
      return DIAGRAM_THEME_ORDER[nextIndex];
    });
  }, []);
  
  // Update all nodes when dark mode changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          darkMode,
        },
      }))
    );
  }, [darkMode, setNodes]);
  
  // Update all nodes when diagram theme changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          diagramTheme,
        },
      }))
    );
  }, [diagramTheme, setNodes]);
  
  // Update edge colors when diagram theme changes
  useEffect(() => {
    const theme = DIAGRAM_THEMES[diagramTheme];
    const themeEdgeColor = darkMode ? EDGE_COLOR : theme.edge.color;
    const themeHighlightColor = darkMode ? HIGHLIGHT_COLOR : theme.edge.highlightColor;
    setEdges((eds: Edge[]) =>
      eds.map((e: Edge) => {
        const currentOpacity = (e.style as Record<string, unknown>)?.opacity as number | undefined;
        const isHighlighted = currentOpacity !== undefined && currentOpacity > 0.5;
        return {
          ...e,
          style: {
            ...e.style,
            stroke: isHighlighted ? themeHighlightColor : themeEdgeColor,
          },
        };
      })
    );
  }, [diagramTheme, darkMode, setEdges]);
  
  // Keyboard shortcuts for settings toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // Cmd/Ctrl + Shift + D = Toggle Dark Mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDarkMode(prev => !prev);
      }
      // Cmd/Ctrl + Shift + G = Toggle Hide Groups
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setHideGroups(prev => !prev);
      }
      // Cmd/Ctrl + Shift + E = Toggle Hide Connectors
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setHideConnectors(prev => !prev);
      }
      // Cmd/Ctrl + Shift + S = Cycle Diagram Theme
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        cycleDiagramTheme();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleDiagramTheme]);
  
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

  // Fetch Notion page content when focus mode opens for a node
  useEffect(() => {
    if (!editorFocusMode || !selectedNode) {
      // Clear when closed
      if (!editorFocusMode) {
        setNotionPageBlocks([]);
        setNotionPageError(null);
      }
      return;
    }
    if (DATA_SOURCE !== 'notion') return;

    const nodeData = selectedNode.data as NodeData;
    const notionPageId = nodeData?.notionPageId;
    const nodeName = nodeData?.label;

    console.log('[NotionPageLoad] Opening focus mode for:', { nodeName, notionPageId, nodeId: selectedNode.id });

    let cancelled = false;
    setNotionPageLoading(true);
    setNotionPageError(null);
    setNotionPageBlocks([]);

    notionService.fetchPageContent(notionPageId, nodeName).then(
      (result) => {
        if (!cancelled) {
          console.log('[NotionPageLoad] Got result:', result.blocks.length, 'blocks, pageId:', result.pageId);
          setNotionPageBlocks(result.blocks);
          setNotionPageLoading(false);
        }
      },
      (err) => {
        if (!cancelled) {
          console.error('[NotionPageLoad] Error:', err);
          setNotionPageError(err instanceof Error ? err.message : 'Failed to load page');
          setNotionPageLoading(false);
        }
      },
    );

    return () => { cancelled = true; };
  }, [editorFocusMode, selectedNode]);

  // Initialize path notes editor content when focus mode opens or path changes
  // The contentEditable uses key={activePathId} so React remounts it for each path.
  // We set innerHTML via useEffect after mount.
  useEffect(() => {
    if (pathNotesFocusMode && activePathId && pathNotesEditorRef.current) {
      if (!pathNotesEditorRef.current.dataset.initialized) {
        pathNotesEditorRef.current.innerHTML = pathNotes[activePathId] || '';
        pathNotesEditorRef.current.dataset.initialized = '1';
      }
    }
  }, [pathNotesFocusMode, activePathId, pathNotes]);

  // Keep nodeNotesRefs clean on close
  useEffect(() => {
    if (!pathNotesFocusMode) {
      nodeNotesRefs.current = {};
    }
  }, [pathNotesFocusMode]);

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

  // Use diagram theme colors for edges and highlights (in light mode)
  const highlightColor = darkMode ? HIGHLIGHT_COLOR : currentDiagramTheme.edge.highlightColor;
  const edgeColor = darkMode ? EDGE_COLOR : currentDiagramTheme.edge.color;

  // Refs for callbacks to avoid re-render loops
  const handleInlineNoteChangeRef = useRef<(nodeId: string, note: string) => void>(() => {});
  const editingNoteNodeIdRef = useRef<string | null>(null);
  const activePathIdForNotesRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    editingNoteNodeIdRef.current = editingNoteNodeId;
  }, [editingNoteNodeId]);
  
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

  // Toggle favourite status for a path
  const handleToggleFav = useCallback((pathId: string, fav: boolean) => {
    // Update in-memory state
    setFavouritePathIds(prev => {
      const next = new Set(prev);
      if (fav) {
        next.add(pathId);
      } else {
        next.delete(pathId);
      }
      // Persist to localStorage immediately
      try {
        const obj: Record<string, boolean> = {};
        next.forEach(id => { obj[id] = true; });
        localStorage.setItem('pathFavourites', JSON.stringify(obj));
      } catch { /* ignore */ }
      return next;
    });
    
    // Also persist to Notion (non-blocking, best-effort)
    if (DATA_SOURCE === 'notion') {
      notionService.updatePathFav(pathId, fav).catch(() => {
        // Silently ignore - localStorage is the source of truth
      });
    }
  }, []);

  // Convert paths list to PathItem format for FolderTree (excludes archived paths)
  const folderPathItems: PathItem[] = useMemo(() => 
    pathsList
      .filter(p => p.name && p.status !== 'archived') // Filter out empty names and archived paths
      .map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priority: p.priority,
        fav: favouritePathIds.has(p.id),
        lastUpdated: pathLastUpdated[p.id] || p.lastUpdated || 0,
      })),
    [pathsList, favouritePathIds, pathLastUpdated]
  );

  // Archived paths for the archived view
  const archivedPathItems: PathItem[] = useMemo(() => 
    pathsList
      .filter(p => p.name && p.status === 'archived')
      .map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priority: p.priority,
        fav: favouritePathIds.has(p.id),
        lastUpdated: pathLastUpdated[p.id] || p.lastUpdated || 0,
      })),
    [pathsList, favouritePathIds, pathLastUpdated]
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
      applyLayout(nodesToLayout as FlowNode[], edgesToLayout as FlowEdge[], currentLayoutType),
    [currentLayoutType]
  );
  
  // Cycle to next layout
  const cycleLayout = useCallback(() => {
    setCurrentLayoutType(current => {
      const currentIndex = LAYOUT_ORDER.indexOf(current);
      const nextIndex = (currentIndex + 1) % LAYOUT_ORDER.length;
      return LAYOUT_ORDER[nextIndex];
    });
  }, []);
  
  // Re-apply layout when layout type changes
  useEffect(() => {
    if (nodes.length > 0) {
      const relaidOut = applyLayout(nodes as FlowNode[], edges as FlowEdge[], currentLayoutType);
      setNodes(relaidOut);
      setTimeout(() => {
        fitView({ duration: 400, padding: 0.15 });
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLayoutType]);

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
        grouping: row._normalized?.grouping?.toString().trim(),
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
        grouping: row.grouping || undefined,
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
              notionPageId: n.notionPageId,
              description: n.description,
              details: n.details,
              longDescription: n.longDescription,
              externalLinks: n.externalLinks,
              images: n.images,
              video: n.video,
              hidden_by_default: n.hidden_by_default,
              wikiUrl: n.wikiUrl,
              grouping: n.grouping,
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
          
          // Sync favourites from Notion into favouritePathIds and localStorage
          const notionFavIds = new Set<string>();
          paths.forEach((p: PathRecord) => {
            if (p.fav) notionFavIds.add(p.id);
          });
          setFavouritePathIds(prev => {
            // Merge: Notion is source of truth, localStorage provides fast initial render
            const merged = new Set(prev);
            notionFavIds.forEach(id => merged.add(id));
            // Sync merged set back to localStorage
            try {
              const obj: Record<string, boolean> = {};
              merged.forEach(id => { obj[id] = true; });
              localStorage.setItem('pathFavourites', JSON.stringify(obj));
            } catch { /* ignore */ }
            return merged;
          });
          
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
          
          // Load path audio URLs
          const pathAudioMap = buildPathAudioMap(paths);
          setPathAudioUrls(pathAudioMap);
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
          
          // Load node-path audio URLs
          const audioMap = buildNodePathAudioMap(nodePaths);
          setNodePathAudioUrls(audioMap);
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
    
    const nodeIdsArray = Array.from(nodeIds);
    
    // Update local state immediately for instant UI feedback
    setPathsList(prev => prev.map(p => 
      p.id === pathId ? { ...p, nodeIds: nodeIdsArray } : p
    ));
    setPathsMap(prev => ({
      ...prev,
      [pathName]: nodeIdsArray,
    }));
    
    // Debounce only the backend save to avoid flooding the API
    if (updatePathNodesRef.current) {
      clearTimeout(updatePathNodesRef.current);
    }
    
    updatePathNodesRef.current = setTimeout(async () => {
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
      } catch (error) {
        console.error('Error updating path nodes:', error);
      }
    }, 500); // 500ms debounce for backend only
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
    // Apply current layout when loading a path (respects user's selected layout)
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
      // Use applyLayout with current layout type to respect user's selection
      return applyLayout(updated as FlowNode[], edges as FlowEdge[], currentLayoutType);
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
            stroke: isActive ? highlightColor : edgeColor,
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
    
    // Reset to default layout
    setCurrentLayoutType('centered');
    
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
          stroke: edgeColor,
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
  
  // Get current theme based on dark mode
  const theme = getTheme(darkMode);

  return (
    <div ref={flowRef} style={{ width: '100vw', height: '100vh', background: theme.canvasBg, transition: 'background 0.3s ease' }}>
      <ReactFlow
        nodes={nodes}
        edges={hideConnectors ? [] : edges}
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
        {/* Node grouping overlay - draws rectangles around grouped nodes */}
        {!hideGroups && <NodeGroupingOverlay nodes={nodes} diagramTheme={currentDiagramTheme} darkMode={darkMode} />}
        {/* <Background color="#222" gap={16} /> */}

        {/* Left sidebar - draggable and resizable */}
        <div
          style={{ 
            position: 'absolute',
            left: leftPanelPos.x,
            top: leftPanelPos.y,
            zIndex: 10,
            background: theme.panelBg, 
            padding: '18px', 
            borderRadius: '16px',
            height: leftPanelSize.height,
            overflowY: 'auto',
            width: leftPanelSize.width,
            boxShadow: theme.panelShadow,
            border: `1px solid ${theme.panelBorder}`,
            backdropFilter: 'blur(12px)',
            transition: 'background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
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
              background: darkMode 
                ? 'linear-gradient(180deg, rgba(30,41,59,0.8) 0%, transparent 100%)' 
                : 'linear-gradient(180deg, rgba(241,245,249,0.8) 0%, transparent 100%)',
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
              background: darkMode ? '#475569' : '#cbd5e1', 
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
          <div style={{ flexShrink: 0, paddingBottom: '8px', borderBottom: darkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid #e2e8f0', marginBottom: '8px' }}>
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
              color: darkMode ? '#f1f5f9' : '#1e293b',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <img 
                src="/favicon.svg" 
                alt="Cinapps logo" 
                style={{ 
                  width: '25px', 
                  height: '25px', 
                  flexShrink: 0,
                }} 
              />
              CINAPs
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
                  color: darkMode ? '#94a3b8' : '#64748b',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = theme.highlightColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = darkMode ? '#94a3b8' : '#64748b';
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
                  background: theme.buttonBg,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: darkMode ? '0 1px 3px rgba(59, 130, 246, 0.4)' : '0 1px 3px rgba(37, 99, 235, 0.3)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = darkMode ? '0 3px 8px rgba(96, 165, 250, 0.5)' : '0 3px 8px rgba(37, 99, 235, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = darkMode ? '0 1px 3px rgba(59, 130, 246, 0.4)' : '0 1px 3px rgba(37, 99, 235, 0.3)';
                }}
                title="Create new path"
              >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
              </button>
              {/* Layout cycle button */}
              <button
                onClick={cycleLayout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  fontSize: '11px',
                  fontWeight: '500',
                  background: darkMode 
                    ? 'linear-gradient(135deg, rgba(71, 85, 105, 0.6) 0%, rgba(51, 65, 85, 0.8) 100%)'
                    : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  color: darkMode ? '#94a3b8' : '#64748b',
                  border: darkMode ? '1px solid rgba(71, 85, 105, 0.4)' : '1px solid #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: darkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease',
                  minWidth: '28px',
                  height: '28px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.background = darkMode 
                    ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.3) 0%, rgba(59, 130, 246, 0.4) 100%)'
                    : 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)';
                  e.currentTarget.style.borderColor = darkMode ? 'rgba(96, 165, 250, 0.5)' : '#a5b4fc';
                  e.currentTarget.style.color = darkMode ? '#60a5fa' : '#4f46e5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.background = darkMode 
                    ? 'linear-gradient(135deg, rgba(71, 85, 105, 0.6) 0%, rgba(51, 65, 85, 0.8) 100%)'
                    : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)';
                  e.currentTarget.style.borderColor = darkMode ? 'rgba(71, 85, 105, 0.4)' : '#cbd5e1';
                  e.currentTarget.style.color = darkMode ? '#94a3b8' : '#64748b';
                }}
                title={`Layout: ${LAYOUT_LABELS[currentLayoutType]} (click to cycle)`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
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
                background: dataError 
                  ? (darkMode ? 'rgba(127, 29, 29, 0.3)' : '#fef2f2') 
                  : (darkMode ? 'rgba(12, 74, 110, 0.3)' : '#f0f9ff'),
                color: dataError 
                  ? (darkMode ? '#fca5a5' : '#b91c1c') 
                  : (darkMode ? '#7dd3fc' : '#0369a1'),
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
              background: darkMode 
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)' 
                : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              border: showSearchDropdown 
                ? (darkMode ? '1px solid rgba(96, 165, 250, 0.5)' : '1px solid rgba(59, 130, 246, 0.4)') 
                : (darkMode ? '1px solid rgba(71, 85, 105, 0.4)' : '1px solid #e2e8f0'),
              borderRadius: '10px',
              padding: '0 10px',
              transition: 'all 0.15s ease',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#64748b' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  color: darkMode ? '#e2e8f0' : '#334155',
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
                    color: darkMode ? '#64748b' : '#94a3b8',
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
                background: darkMode ? '#1e293b' : 'white',
                borderRadius: '10px',
                boxShadow: darkMode ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(15,23,42,0.15)',
                border: darkMode ? '1px solid rgba(71, 85, 105, 0.4)' : '1px solid #e2e8f0',
                zIndex: 100,
                maxHeight: '300px',
                overflowY: 'auto',
              }}>
                {/* Paths section */}
                {searchResults.paths.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px', fontSize: '9px', fontWeight: '600', color: darkMode ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: darkMode ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #f1f5f9' }}>
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
                          background: searchFocusIndex === idx 
                            ? (darkMode ? 'linear-gradient(135deg, rgba(30, 58, 95, 0.8) 0%, rgba(23, 37, 84, 0.8) 100%)' : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)') 
                            : 'transparent',
                          color: searchFocusIndex === idx 
                            ? (darkMode ? '#93c5fd' : '#1d4ed8') 
                            : (darkMode ? '#e2e8f0' : '#334155'),
                          borderBottom: darkMode ? '1px solid rgba(71, 85, 105, 0.2)' : '1px solid #f8fafc',
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
                ? (darkMode 
                    ? 'linear-gradient(135deg, rgba(30, 58, 95, 0.8) 0%, rgba(23, 37, 84, 0.8) 100%)' 
                    : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)')
                : (darkMode 
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)' 
                    : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'),
              color: activePath !== null 
                ? (darkMode ? '#93c5fd' : '#1d4ed8') 
                : (darkMode ? '#94a3b8' : '#64748b'),
              border: activePath !== null 
                ? (darkMode ? '1px solid rgba(96, 165, 250, 0.4)' : '1px solid rgba(59, 130, 246, 0.3)')
                : (darkMode ? '1px solid rgba(71, 85, 105, 0.4)' : '1px solid #e2e8f0'),
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
            background: darkMode ? 'rgba(30, 41, 59, 0.8)' : '#f1f5f9',
            borderRadius: '10px',
          }}>
            <button
              onClick={() => setViewMode('folder')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '9px',
                fontWeight: viewMode === 'folder' ? '600' : '500',
                background: viewMode === 'folder' 
                  ? (darkMode ? 'rgba(15, 23, 42, 0.9)' : 'white') 
                  : 'transparent',
                color: viewMode === 'folder' 
                  ? (darkMode ? '#93c5fd' : '#1d4ed8') 
                  : (darkMode ? '#94a3b8' : '#64748b'),
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'folder' 
                  ? (darkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)') 
                  : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Folders
            </button>
            <button
              onClick={() => setViewMode('alpha')}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '9px',
                fontWeight: viewMode === 'alpha' ? '600' : '500',
                background: viewMode === 'alpha' 
                  ? (darkMode ? 'rgba(15, 23, 42, 0.9)' : 'white') 
                  : 'transparent',
                color: viewMode === 'alpha' 
                  ? (darkMode ? '#93c5fd' : '#1d4ed8') 
                  : (darkMode ? '#94a3b8' : '#64748b'),
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'alpha' 
                  ? (darkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)') 
                  : 'none',
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
                background: viewMode === 'latest' 
                  ? (darkMode ? 'rgba(15, 23, 42, 0.9)' : 'white') 
                  : 'transparent',
                color: viewMode === 'latest' 
                  ? (darkMode ? '#93c5fd' : '#1d4ed8') 
                  : (darkMode ? '#94a3b8' : '#64748b'),
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'latest' 
                  ? (darkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)') 
                  : 'none',
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
                background: viewMode === 'priority' 
                  ? (darkMode ? 'rgba(15, 23, 42, 0.9)' : 'white') 
                  : 'transparent',
                color: viewMode === 'priority' 
                  ? (darkMode ? '#93c5fd' : '#1d4ed8') 
                  : (darkMode ? '#94a3b8' : '#64748b'),
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: viewMode === 'priority' 
                  ? (darkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)') 
                  : 'none',
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
                  } else {
                    // Ensure activePathId is set even if path is already active
                    const pr = pathsList.find(p => p.name === pathName);
                    if (pr) setActivePathId(pr.id || pr.name);
                  }
                  setNotesPathName(pathName);
                  setPathNotesFocusMode(true);
                }}
                onToggleFav={handleToggleFav}
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
                      } else {
                        const pr = pathsList.find(p => p.name === path.name);
                        if (pr) setActivePathId(pr.id || pr.name);
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
                  } else {
                    const pr = pathsList.find(p => p.name === pathName);
                    if (pr) setActivePathId(pr.id || pr.name);
                  }
                  setNotesPathName(pathName);
                  setPathNotesFocusMode(true);
                }}
                onToggleFav={handleToggleFav}
                autoEditPathId={autoEditPathId}
                onAutoEditComplete={() => setAutoEditPathId(null)}
              />
            )}
          </div>
          
          {/* Settings Button */}
          <div style={{ 
            flexShrink: 0, 
            borderTop: darkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid #e2e8f0', 
            marginTop: '8px', 
            paddingTop: '10px' 
          }}>
            <button
              onClick={() => setShowSettings(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                fontWeight: '500',
                background: 'transparent',
                color: darkMode ? '#94a3b8' : '#64748b',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = darkMode ? 'rgba(148, 163, 184, 0.1)' : '#f8fafc';
                e.currentTarget.style.color = darkMode ? '#e2e8f0' : '#334155';
                e.currentTarget.style.borderColor = darkMode ? 'rgba(148, 163, 184, 0.3)' : '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = darkMode ? '#94a3b8' : '#64748b';
                e.currentTarget.style.borderColor = darkMode ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
              Settings
            </button>
          </div>
        </div>
        </div>

      </ReactFlow>
      
      {/* Settings Modal */}
      {showSettings && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: darkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div
            style={{
              background: darkMode 
                ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)' 
                : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: '20px',
              padding: '32px',
              minWidth: '340px',
              maxWidth: '400px',
              boxShadow: darkMode
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(148, 163, 184, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.5), inset 0 1px 0 rgba(255, 255, 255, 1)',
              border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(226, 232, 240, 0.8)',
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '28px',
            }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '18px', 
                fontWeight: '600', 
                color: darkMode ? '#f1f5f9' : '#1e293b',
                letterSpacing: '-0.01em',
              }}>
                Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.08)',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: darkMode ? '#94a3b8' : '#64748b',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = darkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.15)';
                  e.currentTarget.style.color = darkMode ? '#e2e8f0' : '#334155';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.08)';
                  e.currentTarget.style.color = darkMode ? '#94a3b8' : '#64748b';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            {/* Appearance Section */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                fontSize: '11px', 
                fontWeight: '600', 
                color: darkMode ? '#64748b' : '#94a3b8', 
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '14px',
              }}>
                Appearance
              </div>
              
              {/* Dark Mode Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: darkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(241, 245, 249, 0.8)',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(226, 232, 240, 0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: darkMode 
                      ? 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)' 
                      : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: darkMode 
                      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' 
                      : 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
                  }}>
                    {darkMode ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: darkMode ? '#f1f5f9' : '#1e293b',
                      marginBottom: '2px',
                    }}>
                      Dark Mode
                    </div>
                    <div style={{ 
                      fontSize: '11px', 
                      color: darkMode ? '#64748b' : '#94a3b8',
                    }}>
                      ⌘⇧D • {darkMode ? 'Currently enabled' : 'Currently disabled'}
                    </div>
                  </div>
                </div>
                
                {/* Toggle Switch */}
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  style={{
                    position: 'relative',
                    width: '52px',
                    height: '28px',
                    borderRadius: '14px',
                    background: darkMode 
                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                      : 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: darkMode 
                      ? '0 2px 8px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)' 
                      : '0 1px 3px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: darkMode ? '26px' : '3px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '11px',
                      background: '#ffffff',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </button>
              </div>
              
              {/* Hide Groups Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                marginTop: '10px',
                background: darkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(241, 245, 249, 0.8)',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(226, 232, 240, 0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: darkMode 
                      ? 'linear-gradient(135deg, rgba(100, 116, 139, 0.3) 0%, rgba(71, 85, 105, 0.4) 100%)' 
                      : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#94a3b8' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: darkMode ? '#f1f5f9' : '#1e293b',
                      marginBottom: '2px',
                    }}>
                      Hide Groups
                    </div>
                    <div style={{ 
                      fontSize: '11px', 
                      color: darkMode ? '#64748b' : '#94a3b8',
                    }}>
                      ⌘⇧G • {hideGroups ? 'Groups hidden' : 'Groups visible'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setHideGroups(!hideGroups)}
                  style={{
                    position: 'relative',
                    width: '52px',
                    height: '28px',
                    borderRadius: '14px',
                    background: hideGroups 
                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                      : 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: hideGroups 
                      ? '0 2px 8px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)' 
                      : '0 1px 3px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '3px',
                    left: hideGroups ? '26px' : '3px',
                    width: '22px',
                    height: '22px',
                    borderRadius: '11px',
                    background: '#ffffff',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </button>
              </div>
              
              {/* Hide Connectors Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                marginTop: '10px',
                background: darkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(241, 245, 249, 0.8)',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(226, 232, 240, 0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: darkMode 
                      ? 'linear-gradient(135deg, rgba(100, 116, 139, 0.3) 0%, rgba(71, 85, 105, 0.4) 100%)' 
                      : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#94a3b8' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: darkMode ? '#f1f5f9' : '#1e293b',
                      marginBottom: '2px',
                    }}>
                      Hide Connectors
                    </div>
                    <div style={{ 
                      fontSize: '11px', 
                      color: darkMode ? '#64748b' : '#94a3b8',
                    }}>
                      ⌘⇧E • {hideConnectors ? 'Edges hidden' : 'Edges visible'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setHideConnectors(!hideConnectors)}
                  style={{
                    position: 'relative',
                    width: '52px',
                    height: '28px',
                    borderRadius: '14px',
                    background: hideConnectors 
                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                      : 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: hideConnectors 
                      ? '0 2px 8px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)' 
                      : '0 1px 3px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '3px',
                    left: hideConnectors ? '26px' : '3px',
                    width: '22px',
                    height: '22px',
                    borderRadius: '11px',
                    background: '#ffffff',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </button>
              </div>
              
              {/* Diagram Theme Selector */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                marginTop: '10px',
                background: darkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(241, 245, 249, 0.8)',
                borderRadius: '12px',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(226, 232, 240, 0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${currentDiagramTheme.node.accent}20 0%, ${currentDiagramTheme.node.accent}10 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={currentDiagramTheme.node.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="4"/>
                      <line x1="21.17" y1="8" x2="12" y2="8"/>
                      <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
                      <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: darkMode ? '#f1f5f9' : '#1e293b',
                      marginBottom: '2px',
                    }}>
                      Diagram Style
                    </div>
                    <div style={{ 
                      fontSize: '11px', 
                      color: darkMode ? '#64748b' : '#94a3b8',
                    }}>
                      ⌘⇧S • {currentDiagramTheme.name}
                    </div>
                  </div>
                </div>
                <select
                  value={diagramTheme}
                  onChange={(e) => setDiagramTheme(e.target.value as DiagramThemeId)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '10px',
                    border: darkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(203, 213, 225, 0.8)',
                    background: darkMode 
                      ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)' 
                      : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    color: darkMode ? '#e2e8f0' : '#334155',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '120px',
                    boxShadow: darkMode 
                      ? '0 1px 3px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)' 
                      : '0 1px 3px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 1)',
                  }}
                >
                  {DIAGRAM_THEME_ORDER.map(themeId => (
                    <option key={themeId} value={themeId}>
                      {DIAGRAM_THEMES[themeId].name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Version Info */}
            <div style={{ 
              textAlign: 'center', 
              paddingTop: '16px', 
              borderTop: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(226, 232, 240, 0.6)',
            }}>
              <div style={{ 
                fontSize: '10px', 
                color: darkMode ? '#475569' : '#94a3b8',
                letterSpacing: '0.02em',
              }}>
                CINAPs v1.0.0
              </div>
            </div>
          </div>
        </div>
      )}
      
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
                    {/* Audio recorder for node notes in focus mode */}
                    <div style={{ marginLeft: 'auto', paddingLeft: '12px', borderLeft: '1px solid rgba(203,213,225,0.5)' }}>
                      <AudioRecorder
                        compact={false}
                        darkMode={false}
                        existingAudioUrls={activePathId ? (nodePathAudioUrls[activePathId]?.[nodeId] || []) : []}
                        onRecordingComplete={async (audioBlob, _duration) => {
                          try {
                            if (DATA_SOURCE === 'notion' && activePathId) {
                              await saveNodePathAudioNote(
                                `${activePathId}_${nodeId}`,
                                activePathId,
                                nodeId,
                                audioBlob
                              );
                              // Refresh the audio URLs after upload
                              const nodePaths = await notionService.fetchNodePaths();
                              const newAudioMap = buildNodePathAudioMap(nodePaths);
                              setNodePathAudioUrls(newAudioMap);
                            }
                          } catch (error) {
                            console.error('Error saving audio note:', error);
                          }
                        }}
                        onDeleteAudio={async (index) => {
                          // Note: Deletion would need to be implemented in the Notion service
                          console.log('Delete audio at index:', index);
                        }}
                      />
                    </div>
                  </div>
              
              {/* Focus mode WYSIWYG editor */}
              <div style={{ flex: 1, padding: '20px', overflow: 'auto', background: 'rgba(248,250,252,0.5)' }}>
                <div
                  ref={focusModeEditorRef}
                  contentEditable
                  dir="ltr"
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
                    textAlign: 'left',
                    direction: 'ltr',
                    unicodeBidi: 'plaintext',
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
                
                {/* Right column: Notion Page Documentation */}
                <div style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(248,250,252,0.6)' }}>
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
                    {selectedNodeData?.notionPageId && (
                      <a
                        href={`https://www.notion.so/${selectedNodeData.notionPageId.replace(/-/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Notion"
                        style={{
                          marginLeft: 'auto',
                          fontSize: '11px',
                          color: '#94a3b8',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '5px',
                          background: 'rgba(100,116,139,0.08)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#475569';
                          e.currentTarget.style.background = 'rgba(100,116,139,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#94a3b8';
                          e.currentTarget.style.background = 'rgba(100,116,139,0.08)';
                        }}
                      >
                        Open in Notion ↗
                      </a>
                    )}
                  </div>
                  <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
                    {/* Notion page content */}
                    <NotionPageRenderer
                      blocks={notionPageBlocks}
                      isLoading={notionPageLoading}
                      error={notionPageError}
                      accentColor={selectedNodeData?.color || '#3b82f6'}
                      fallbackDescription={selectedNodeData?.longDescription}
                      fallbackImages={selectedNodeData?.images}
                      fallbackVideo={selectedNodeData?.video}
                      onRetry={() => {
                        const nd = selectedNode?.data as NodeData;
                        if (nd) {
                          setNotionPageLoading(true);
                          setNotionPageError(null);
                          notionService.fetchPageContent(nd.notionPageId, nd.label).then(
                            (r) => { setNotionPageBlocks(r.blocks); setNotionPageLoading(false); },
                            (e) => { setNotionPageError(e instanceof Error ? e.message : 'Failed'); setNotionPageLoading(false); },
                          );
                        }
                      }}
                    />

                    {/* External links — shown below the Notion content */}
                    {(selectedNodeData?.externalLinks?.length ?? 0) > 0 && (
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(226,232,240,0.5)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>External Links</div>
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
                              padding: '8px 12px',
                              marginBottom: '6px',
                              background: 'rgba(255,255,255,0.9)',
                              borderRadius: '8px',
                              color: '#2563eb',
                              fontWeight: 500,
                              fontSize: '12px',
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

                    {/* Wiki link */}
                    {selectedNodeData?.wikiUrl && (
                      <div style={{ marginTop: '12px' }}>
                        <a
                          href={selectedNodeData.wikiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 14px',
                            background: `linear-gradient(135deg, ${selectedNodeData.color || '#3b82f6'} 0%, ${selectedNodeData.color || '#3b82f6'}dd 100%)`,
                            color: 'white',
                            borderRadius: '10px',
                            fontWeight: 600,
                            fontSize: '12px',
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
                          <span>Open Wiki</span>
                          <span>↗</span>
                        </a>
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
                
                {/* Archive button */}
                <button
                  onClick={async () => {
                    const isCurrentlyArchived = currentPath?.status === 'archived';
                    const newStatus = isCurrentlyArchived ? '' : 'archived';
                    
                    // Update local state immediately
                    setPathsList(prev => prev.map(p => 
                      p.id === activePathId ? { ...p, status: newStatus } : p
                    ));
                    
                    // Save to Notion
                    try {
                      if (DATA_SOURCE === 'notion') {
                        await notionService.updatePathStatus(activePathId, newStatus);
                      }
                    } catch (error) {
                      console.error('Error updating path status:', error);
                      // Revert on error
                      setPathsList(prev => prev.map(p => 
                        p.id === activePathId ? { ...p, status: isCurrentlyArchived ? 'archived' : '' } : p
                      ));
                    }
                    
                    // Close focus mode after archiving
                    if (!isCurrentlyArchived) {
                      setPathNotesFocusMode(false);
                    }
                  }}
                  title={currentPath?.status === 'archived' ? 'Unarchive path' : 'Archive path'}
                  style={{
                    background: currentPath?.status === 'archived' 
                      ? 'rgba(34,197,94,0.1)' 
                      : 'rgba(100,116,139,0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    color: currentPath?.status === 'archived' ? '#22c55e' : '#64748b',
                    fontSize: '11px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (currentPath?.status === 'archived') {
                      e.currentTarget.style.background = 'rgba(34,197,94,0.2)';
                      e.currentTarget.style.color = '#16a34a';
                    } else {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                      e.currentTarget.style.color = '#ef4444';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentPath?.status === 'archived') {
                      e.currentTarget.style.background = 'rgba(34,197,94,0.1)';
                      e.currentTarget.style.color = '#22c55e';
                    } else {
                      e.currentTarget.style.background = 'rgba(100,116,139,0.1)';
                      e.currentTarget.style.color = '#64748b';
                    }
                  }}
                >
                  {currentPath?.status === 'archived' ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 8v13H3V8"/>
                        <path d="M1 3h22v5H1z"/>
                        <path d="M10 12h4"/>
                      </svg>
                      Unarchive
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 8v13H3V8"/>
                        <path d="M1 3h22v5H1z"/>
                        <path d="M10 12h4"/>
                      </svg>
                      Archive
                    </>
                  )}
                </button>
                
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
                  
                  {/* Audio Recorder for path notes */}
                  <AudioRecorder
                    onRecordingComplete={async (audioBlob) => {
                      if (DATA_SOURCE === 'notion' && activePathId) {
                        try {
                          await savePathAudioNote(activePathId, audioBlob);
                          console.log('Path audio note saved successfully');
                          // Refresh the audio URL after upload
                          const paths = await notionService.fetchPaths();
                          const newAudioMap = buildPathAudioMap(paths);
                          setPathAudioUrls(newAudioMap);
                        } catch (error) {
                          console.error('Failed to save path audio note:', error);
                        }
                      }
                    }}
                    existingAudioUrls={activePathId ? pathAudioUrls[activePathId] || [] : []}
                    compact={false}
                  />
                  
                  <div
                    key={`path-notes-${activePathId}`}
                    ref={pathNotesEditorRef}
                    contentEditable
                    dir="ltr"
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
                      unicodeBidi: 'plaintext',
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
                              {/* Audio recorder for voice notes */}
                              <div style={{ marginLeft: 'auto', paddingLeft: '8px' }}>
                                <AudioRecorder
                                  compact
                                  darkMode={false}
                                  existingAudioUrls={nodePathAudioUrls[activePathId]?.[nodeId] || []}
                                  onRecordingComplete={async (audioBlob, _duration) => {
                                    try {
                                      if (DATA_SOURCE === 'notion') {
                                        await saveNodePathAudioNote(
                                          `${activePathId}_${nodeId}`,
                                          activePathId,
                                          nodeId,
                                          audioBlob
                                        );
                                        // Refresh the audio URLs after upload
                                        const nodePaths = await notionService.fetchNodePaths();
                                        const newAudioMap = buildNodePathAudioMap(nodePaths);
                                        setNodePathAudioUrls(newAudioMap);
                                      }
                                    } catch (error) {
                                      console.error('Error saving audio note:', error);
                                    }
                                  }}
                                />
                              </div>
                            </div>
                            <div
                              key={`node-note-${activePathId}-${nodeId}`}
                              ref={(el) => {
                                nodeNotesRefs.current[nodeId] = el;
                                if (el && !el.dataset.initialized) {
                                  el.innerHTML = sidebarNodeContent[nodeId] ?? (nodePathMap[activePathId]?.[nodeId] || '');
                                  el.dataset.initialized = '1';
                                }
                              }}
                              contentEditable
                              dir="ltr"
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
                                textAlign: 'left',
                                direction: 'ltr',
                                unicodeBidi: 'plaintext',
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
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(24px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSidebarFocusMode(false);
              setSelectedPathIds(new Set());
            }
          }}
        >
          <div
            style={{
              width: '95%',
              maxWidth: '800px',
              minWidth: '50vw',
              height: '85vh',
              maxHeight: '800px',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.92) 100%)',
              backdropFilter: 'blur(40px)',
              borderRadius: '20px',
              boxShadow: '0 32px 100px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.6) inset, 0 1px 0 rgba(255,255,255,0.8) inset',
              border: '1px solid rgba(148,163,184,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(203,213,225,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'transparent',
              flexShrink: 0,
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', letterSpacing: '-0.01em' }}>
                  Path Manager
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>
                  {pathsList.length} paths
                </div>
              </div>
              {/* Compact action buttons */}
              <button
                onClick={createNewPath}
                title="New Path"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.3)';
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New
              </button>
              <button
                onClick={() => {
                  resetView();
                  setSelectedNodeFilter(null);
                  setSelectedNodeFilterLabel('');
                }}
                title="Clear View"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: 'rgba(100,116,139,0.08)',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(100,116,139,0.15)';
                  e.currentTarget.style.color = '#475569';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(100,116,139,0.08)';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setSidebarFocusMode(false);
                  setSelectedPathIds(new Set());
                }}
                title="Close (Esc)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  width: '26px',
                  height: '26px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(100,116,139,0.1)';
                  e.currentTarget.style.color = '#64748b';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' }}>
              {/* View mode selector - refined pill style */}
              <div style={{
                display: 'flex',
                gap: '2px',
                padding: '3px',
                background: 'rgba(241,245,249,0.8)',
                borderRadius: '8px',
                marginBottom: '12px',
                flexShrink: 0,
              }}>
                {[
                  { mode: 'folder' as const, label: 'Folders' },
                  { mode: 'alpha' as const, label: 'A-Z' },
                  { mode: 'latest' as const, label: 'Recent' },
                  { mode: 'priority' as const, label: 'Priority' },
                  { mode: 'archived' as const, label: '📦 Archived' },
                ].map((v) => (
                  <button
                    key={v.mode}
                    onClick={() => setFocusViewMode(v.mode)}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '10px',
                      fontWeight: focusViewMode === v.mode ? 600 : 500,
                      background: focusViewMode === v.mode ? 'white' : 'transparent',
                      color: focusViewMode === v.mode ? '#1d4ed8' : '#64748b',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: focusViewMode === v.mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              
              {/* Scrollable content area */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {focusViewMode === 'folder' ? (
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
                    } else {
                      const pr = pathsList.find(p => p.name === pathName);
                      if (pr) setActivePathId(pr.id || pr.name);
                    }
                    setNotesPathName(pathName);
                    setPathNotesFocusMode(true);
                    setSidebarFocusMode(false);
                  }}
                  onToggleFav={handleToggleFav}
                  hideUnassigned={true}
                  autoEditPathId={autoEditPathId}
                  onAutoEditComplete={() => setAutoEditPathId(null)}
                />
              ) : focusViewMode === 'archived' ? (
                /* Archived paths view - folder structure for archived paths */
                archivedPathItems.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                    <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px', opacity: 0.4 }}>📦</span>
                    No archived paths
                  </div>
                ) : (
                <FolderTree
                  folders={folderTree}
                  paths={archivedPathItems}
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
                    } else {
                      const pr = pathsList.find(p => p.name === pathName);
                      if (pr) setActivePathId(pr.id || pr.name);
                    }
                    setNotesPathName(pathName);
                    setPathNotesFocusMode(true);
                    setSidebarFocusMode(false);
                  }}
                  onToggleFav={handleToggleFav}
                  hideUnassigned={false}
                  autoEditPathId={autoEditPathId}
                  onAutoEditComplete={() => setAutoEditPathId(null)}
                />
                )
              ) : (
                /* Sleek list for A-Z, Latest, and Priority views with multi-select */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {/* Multi-select action bar */}
                  {selectedPathIds.size >= 2 && (
                    <div 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        marginBottom: '8px',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(99,102,241,0.08) 100%)',
                        borderRadius: '8px',
                        border: '1px solid rgba(59,130,246,0.2)',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#3b82f6' }}>
                        {selectedPathIds.size} selected
                      </span>
                      <div style={{ flex: 1 }} />
                      {/* Archive all selected */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const idsToArchive = Array.from(selectedPathIds);
                          // Update local state immediately
                          setPathsList(prev => prev.map(p => 
                            idsToArchive.includes(p.id) ? { ...p, status: 'archived' } : p
                          ));
                          // Save to Notion
                          try {
                            if (DATA_SOURCE === 'notion') {
                              await Promise.all(idsToArchive.map(id => notionService.updatePathStatus(id, 'archived')));
                            }
                          } catch (error) {
                            console.error('Error archiving paths:', error);
                          }
                          setSelectedPathIds(new Set());
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          fontSize: '10px',
                          fontWeight: 500,
                          background: 'rgba(100,116,139,0.1)',
                          color: '#64748b',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
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
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>
                        </svg>
                        Archive
                      </button>
                      {/* Delete all selected */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const idsToDelete = Array.from(selectedPathIds);
                          const pathNames = pathsList.filter(p => idsToDelete.includes(p.id)).map(p => p.name);
                          if (window.confirm(`Delete ${pathNames.length} paths?`)) {
                            for (const name of pathNames) {
                              await deletePathByName(name);
                            }
                            setSelectedPathIds(new Set());
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          fontSize: '10px',
                          fontWeight: 500,
                          background: 'rgba(239,68,68,0.1)',
                          color: '#ef4444',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Delete
                      </button>
                      {/* Clear selection */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPathIds(new Set());
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontWeight: 500,
                          background: 'transparent',
                          color: '#94a3b8',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#64748b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#94a3b8';
                        }}
                      >
                        ✕ Clear
                      </button>
                    </div>
                  )}
                  
                  {/* Path list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {(() => {
                    const sortedPaths = focusViewMode === 'alpha' 
                      ? [...pathsList].filter(p => p.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name))
                      : focusViewMode === 'priority'
                      ? [...pathsList].filter(p => p.status !== 'archived').sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
                      : [...pathsList].filter(p => p.status !== 'archived').sort((a, b) => (pathLastUpdated[b.id] || 0) - (pathLastUpdated[a.id] || 0));
                    
                    return sortedPaths.map((path, index, arr) => {
                    const priorityColor = `rgb(${Math.round(239 * ((path.priority ?? 50) / 100) + 59 * (1 - (path.priority ?? 50) / 100))}, ${Math.round(68 * ((path.priority ?? 50) / 100) + 130 * (1 - (path.priority ?? 50) / 100))}, ${Math.round(68 * ((path.priority ?? 50) / 100) + 246 * (1 - (path.priority ?? 50) / 100))})`;
                    const isFirst = index === 0;
                    const isLast = index === arr.length - 1;
                    const isSelected = selectedPathIds.has(path.id);
                    const isDragging = draggedPathIds.includes(path.id);
                    
                    return (
                    <div
                      key={path.id}
                      draggable={isSelected && selectedPathIds.size >= 2}
                      onDragStart={(e) => {
                        if (isSelected && selectedPathIds.size >= 2) {
                          setIsDraggingSelected(true);
                          setDraggedPathIds(Array.from(selectedPathIds));
                          e.dataTransfer.setData('application/x-multi-paths', JSON.stringify(Array.from(selectedPathIds)));
                          e.dataTransfer.effectAllowed = 'move';
                        }
                      }}
                      onDragEnd={() => {
                        setIsDraggingSelected(false);
                        setDraggedPathIds([]);
                      }}
                      onClick={(e) => {
                        // Handle multi-select with shift key
                        if (e.shiftKey && lastClickedPathId) {
                          const currentIndex = arr.findIndex(p => p.id === path.id);
                          const lastIndex = arr.findIndex(p => p.id === lastClickedPathId);
                          const [start, end] = [Math.min(currentIndex, lastIndex), Math.max(currentIndex, lastIndex)];
                          const rangeIds = arr.slice(start, end + 1).map(p => p.id);
                          setSelectedPathIds(prev => {
                            const newSet = new Set(prev);
                            rangeIds.forEach(id => newSet.add(id));
                            return newSet;
                          });
                        } else if (selectedPathIds.size > 0 && !e.ctrlKey && !e.metaKey) {
                          // If something is selected and no modifier, clear selection and navigate
                          setSelectedPathIds(new Set());
                          showPath(path.name);
                          setSidebarFocusMode(false);
                        } else {
                          showPath(path.name);
                          setSidebarFocusMode(false);
                        }
                        setLastClickedPathId(path.id);
                      }}
                      style={{
                        padding: '8px 12px',
                        background: isSelected 
                          ? 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.06) 100%)'
                          : activePath === path.name 
                          ? 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.04) 100%)'
                          : 'transparent',
                        borderRadius: isFirst ? '8px 8px 0 0' : isLast ? '0 0 8px 8px' : '0',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        borderLeft: isSelected 
                          ? '2px solid #6366f1'
                          : activePath === path.name 
                          ? '2px solid #3b82f6' 
                          : '2px solid transparent',
                        opacity: isDragging ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected && activePath !== path.name) {
                          e.currentTarget.style.background = 'rgba(241,245,249,0.8)';
                        }
                        // Show checkbox on hover
                        const checkbox = e.currentTarget.querySelector('.path-checkbox') as HTMLElement;
                        if (checkbox) checkbox.style.opacity = '1';
                        // Show priority slider on hover in priority view
                        const slider = e.currentTarget.querySelector('.priority-slider-inline') as HTMLElement;
                        if (slider) {
                          slider.style.opacity = '1';
                          slider.style.width = '80px';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected && activePath !== path.name) {
                          e.currentTarget.style.background = 'transparent';
                        }
                        // Hide checkbox if not selected
                        const checkbox = e.currentTarget.querySelector('.path-checkbox') as HTMLElement;
                        if (checkbox && !isSelected) checkbox.style.opacity = '0';
                        // Hide priority slider
                        const slider = e.currentTarget.querySelector('.priority-slider-inline') as HTMLElement;
                        if (slider) {
                          slider.style.opacity = '0';
                          slider.style.width = '0';
                        }
                      }}
                    >
                      {/* Checkbox for multi-select */}
                      <div
                        className="path-checkbox"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPathIds(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(path.id)) {
                              newSet.delete(path.id);
                            } else {
                              newSet.add(path.id);
                            }
                            return newSet;
                          });
                          setLastClickedPathId(path.id);
                        }}
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '3px',
                          border: isSelected ? 'none' : '1.5px solid #cbd5e1',
                          background: isSelected ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' : 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          opacity: isSelected ? 1 : 0,
                          transition: 'all 0.15s ease',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      
                      {/* File icon */}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isSelected ? '#6366f1' : activePath === path.name ? '#3b82f6' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      
                      {/* Priority indicator dot - only show if set */}
                      {path.priority !== undefined && (
                        <span 
                          style={{ 
                            width: '5px', 
                            height: '5px', 
                            borderRadius: '50%', 
                            flexShrink: 0,
                            background: priorityColor,
                          }} 
                        />
                      )}
                      
                      {/* Path name */}
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: isSelected ? 600 : activePath === path.name ? 600 : 500, 
                        color: isSelected ? '#4f46e5' : activePath === path.name ? '#1d4ed8' : '#475569',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {path.name}
                      </span>
                      
                      {/* Latest view: show date */}
                      {focusViewMode === 'latest' && pathLastUpdated[path.id] && (
                        <span style={{ fontSize: '9px', color: '#94a3b8', flexShrink: 0 }}>
                          {new Date(pathLastUpdated[path.id]).toLocaleDateString()}
                        </span>
                      )}
                      
                      {/* Priority view: show value and inline slider on hover */}
                      {focusViewMode === 'priority' && (
                        <>
                          <div 
                            className="priority-slider-inline"
                            style={{ 
                              opacity: 0,
                              width: 0,
                              overflow: 'hidden',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              alignItems: 'center',
                              flexShrink: 0,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
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
                                width: '70px',
                                height: '4px',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                background: `linear-gradient(to right, #3b82f6 0%, #ef4444 100%)`,
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            />
                          </div>
                          <span style={{ 
                            fontSize: '9px', 
                            color: priorityColor,
                            fontWeight: 600,
                            flexShrink: 0,
                            minWidth: '20px',
                            textAlign: 'right',
                          }}>
                            {path.priority ?? 50}
                          </span>
                        </>
                      )}
                      
                      {/* Archive button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const isCurrentlyArchived = path.status === 'archived';
                          const newStatus = isCurrentlyArchived ? '' : 'archived';
                          
                          // Update local state immediately
                          setPathsList(prev => prev.map(p => 
                            p.id === path.id ? { ...p, status: newStatus } : p
                          ));
                          
                          // Save to Notion
                          try {
                            if (DATA_SOURCE === 'notion') {
                              await notionService.updatePathStatus(path.id, newStatus);
                            }
                          } catch (error) {
                            console.error('Error updating path status:', error);
                            // Revert on error
                            setPathsList(prev => prev.map(p => 
                              p.id === path.id ? { ...p, status: isCurrentlyArchived ? 'archived' : '' } : p
                            ));
                          }
                        }}
                        title={path.status === 'archived' ? 'Unarchive' : 'Archive'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          width: '22px',
                          height: '22px',
                          cursor: 'pointer',
                          color: path.status === 'archived' ? '#22c55e' : '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = path.status === 'archived' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)';
                          e.currentTarget.style.color = path.status === 'archived' ? '#16a34a' : '#64748b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = path.status === 'archived' ? '#22c55e' : '#94a3b8';
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 8v13H3V8"/>
                          <path d="M1 3h22v5H1z"/>
                          <path d="M10 12h4"/>
                        </svg>
                      </button>
                      
                      {/* Delete button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete path "${path.name}"?`)) {
                            await deletePathByName(path.name);
                          }
                        }}
                        title="Delete path"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          width: '22px',
                          height: '22px',
                          cursor: 'pointer',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#94a3b8';
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  )});
                  })()}
                  </div>
                  
                  {/* Empty state */}
                  {pathsList.filter(p => p.status !== 'archived').length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                      No paths found
                    </div>
                  )}
                </div>
              )}
              </div>
              
              {/* Sticky Unassigned Paths Section (only in folder view) */}
              {focusViewMode === 'folder' && (
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
                    } else {
                      const pr = pathsList.find(p => p.name === pathName);
                      if (pr) setActivePathId(pr.id || pr.name);
                    }
                    setNotesPathName(pathName);
                    setPathNotesFocusMode(true);
                    setSidebarFocusMode(false);
                  }}
                  onToggleFav={handleToggleFav}
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