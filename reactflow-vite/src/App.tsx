import { useCallback, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  Node,
  Edge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type NodeData = {
  label: string;
  description?: string;
  color: string;
  category: string;
  wikiUrl?: string;
  details?: string;
  parentId?: string; // Track parent for expand/collapse
};

// Custom Node Component with enhanced styling
function MethodNode(props: any) {
  const data = props.data as NodeData;
  const selected = props.selected as boolean;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: data.color,
        color: '#fff',
        minWidth: 160,
        maxWidth: 200,
        boxShadow: selected
          ? '0 0 0 3px #ffd700, 0 8px 24px rgba(0,0,0,0.3)'
          : '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        border: '2px solid rgba(255,255,255,0.2)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{data.label}</div>
      {data.category && (
        <div style={{ fontSize: 10, opacity: 0.8, fontStyle: 'italic' }}>
          {data.category}
        </div>
      )}
      {data.description && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
}

const nodeTypes = { method: MethodNode };

// Complete CIPHER Method Nodes
const initialNodes: Node[] = [
  // Title
  {
    id: 'title',
    type: 'method',
    data: {
      label: 'CIPHER METHOD',
      description: 'Cognitive Intelligence Pattern Handling & Emotional Release',
      color: '#1a1a2e',
      category: 'Framework',
      wikiUrl: 'https://unburdened.earth/wiki/cipher-method',
      details: 'CIPHER is a precision tool for decoding and editing your somatic intelligence. Like CRISPR edits genes, CIPHER edits somatic patterns with psychological precision.',
    },
    position: { x: 600, y: 0 },
  },
  
  // Framework Overview
  {
    id: 'framework',
    type: 'method',
    data: {
      label: 'Somatic Intelligence Model',
      description: 'BS/US Signal Architecture',
      color: '#16213e',
      category: 'Core Theory',
      wikiUrl: 'https://unburdened.earth/wiki/somatic-intelligence',
      details: 'Your body processes millions of data points about safety and threat. This is the foundational architecture that explains how every feeling works.',
      parentId: 'title',
    },
    position: { x: 600, y: 100 },
    hidden: true, // Hidden until title is clicked
  },
  
  {
    id: 'bs-signal',
    type: 'method',
    data: {
      label: 'BS (Burden Signal)',
      description: 'Biological sense of burden/bother that drives action',
      color: '#e74c3c',
      category: 'Signal Type',
      wikiUrl: 'https://unburdened.earth/wiki/burden-signal',
      details: 'Any feeling that bothers you. Your body saying "there\'s a safety threat." This chemical/biological pressure makes you want to act.',
      parentId: 'framework',
    },
    position: { x: 400, y: 200 },
    hidden: true,
  },
  
  {
    id: 'us-signal',
    type: 'method',
    data: {
      label: 'US (Unburden Signal)',
      description: 'Relief, joy, safety achieved',
      color: '#27ae60',
      category: 'Signal Type',
      wikiUrl: 'https://unburdened.earth/wiki/unburden-signal',
      details: 'Any feeling of relief/joy. Your body saying "safety increased, burden released." The goal of the CIPHER method.',
      parentId: 'framework',
    },
    position: { x: 800, y: 200 },
    hidden: true,
  },

  // Somatic Intelligence Grid
  {
    id: 'si-grid',
    type: 'method',
    data: {
      label: 'Somatic Intelligence Grid',
      description: '4-Quadrant Assessment Tool',
      color: '#8e44ad',
      category: 'Assessment',
      wikiUrl: 'https://unburdened.earth/wiki/si-grid',
      details: 'Map any feeling to one of four quadrants based on threat/safety signal and evidence level. This clarifies what you\'re actually dealing with.',
      parentId: 'framework',
    },
    position: { x: 600, y: 300 },
    hidden: true,
  },

  {
    id: 'phantom-threat',
    type: 'method',
    data: {
      label: 'Phantom Threat',
      description: 'High threat + Low evidence',
      color: '#e67e22',
      category: 'Quadrant',
      wikiUrl: 'https://unburdened.earth/wiki/phantom-threat',
      details: 'You feel threatened but there\'s little evidence to support it. Most anxiety lives here. Your body remembers past threats and applies them to present.',
      parentId: 'si-grid',
    },
    position: { x: 350, y: 400 },
    hidden: true,
  },

  {
    id: 'clear-threat',
    type: 'method',
    data: {
      label: 'Clear Threat',
      description: 'High threat + High evidence',
      color: '#c0392b',
      category: 'Quadrant',
      wikiUrl: 'https://unburdened.earth/wiki/clear-threat',
      details: 'Real danger with evidence. Your body is right to signal threat. Action required, but from clarity not panic.',
      parentId: 'si-grid',
    },
    position: { x: 550, y: 400 },
    hidden: true,
  },

  {
    id: 'assumed-safety',
    type: 'method',
    data: {
      label: 'Assumed Safety',
      description: 'High safety + Low evidence',
      color: '#f39c12',
      category: 'Quadrant',
      wikiUrl: 'https://unburdened.earth/wiki/assumed-safety',
      details: 'You feel safe but haven\'t verified. Could be naive optimism or wishful thinking. Useful sometimes, dangerous others.',
      parentId: 'si-grid',
    },
    position: { x: 750, y: 400 },
    hidden: true,
  },

  {
    id: 'grounded-safety',
    type: 'method',
    data: {
      label: 'Grounded Safety',
      description: 'High safety + High evidence',
      color: '#27ae60',
      category: 'Quadrant',
      wikiUrl: 'https://unburdened.earth/wiki/grounded-safety',
      details: 'Real safety with evidence. This is the goal: feeling safe because you actually are safe. Living unburdened.',
      parentId: 'si-grid',
    },
    position: { x: 950, y: 400 },
    hidden: true,
  },

  // STEP 1: Immerse
  {
    id: 'step1',
    type: 'method',
    data: {
      label: 'STEP 1: Immerse',
      description: 'Signal-Producing Experience',
      color: '#3498db',
      category: 'Process',
      wikiUrl: 'https://unburdened.earth/wiki/step1-immerse',
      details: 'Choose an experience that produces a burden signal. This is what you\'ll decode. Click to see options.',
      parentId: 'si-grid',
    },
    position: { x: 150, y: 550 },
    hidden: true,
  },

  {
    id: 'step1-thought',
    type: 'method',
    data: {
      label: 'Thought',
      description: 'Mental content producing signal',
      color: '#5dade2',
      category: 'Experience Type',
      wikiUrl: 'https://unburdened.earth/wiki/thought',
      details: 'A thought that creates discomfort. "What if I fail?" "They don\'t like me." Immerse in the thought fully.',
      parentId: 'step1',
    },
    position: { x: 0, y: 650 },
    hidden: true,
  },

  {
    id: 'step1-real-situation',
    type: 'method',
    data: {
      label: 'Real Situation',
      description: 'Current life circumstance',
      color: '#5dade2',
      category: 'Experience Type',
      wikiUrl: 'https://unburdened.earth/wiki/real-situation',
      details: 'An actual situation causing burden. A conversation you need to have, a decision to make, a conflict happening.',
      parentId: 'step1',
    },
    position: { x: 180, y: 650 },
    hidden: true,
  },

  {
    id: 'step1-sensation',
    type: 'method',
    data: {
      label: 'Sensation',
      description: 'Body-based feeling',
      color: '#5dade2',
      category: 'Experience Type',
      wikiUrl: 'https://unburdened.earth/wiki/sensation',
      details: 'A physical sensation in your body. Tightness in chest, pit in stomach, tension in shoulders. Start with the body.',
      parentId: 'step1',
    },
    position: { x: 0, y: 750 },
    hidden: true,
  },

  {
    id: 'step1-idea',
    type: 'method',
    data: {
      label: 'Idea',
      description: 'Future possibility',
      color: '#5dade2',
      category: 'Experience Type',
      wikiUrl: 'https://unburdened.earth/wiki/idea',
      details: 'An idea about your future. Starting a business, moving cities, changing careers. Notice what burden arises.',
      parentId: 'step1',
    },
    position: { x: 180, y: 750 },
    hidden: true,
  },

  {
    id: 'step1-memory',
    type: 'method',
    data: {
      label: 'Memory',
      description: 'Past experience',
      color: '#5dade2',
      category: 'Experience Type',
      wikiUrl: 'https://unburdened.earth/wiki/memory',
      details: 'A memory that still produces burden. Even years later, thinking about it creates discomfort. Unresolved.',
      parentId: 'step1',
    },
    position: { x: 90, y: 850 },
    hidden: true,
  },

  // STEP 2: Read Signal
  {
    id: 'step2',
    type: 'method',
    data: {
      label: 'STEP 2: Read Signal',
      description: 'Attentive Signal Reading',
      color: '#9b59b6',
      category: 'Process',
      wikiUrl: 'https://unburdened.earth/wiki/step2-read',
      details: 'Read your somatic intelligence fully. Decode ALL components of the burden. This is where most methods fail - they skip this step.',
      parentId: 'step1',
    },
    position: { x: 450, y: 550 },
    hidden: true,
  },

  {
    id: 'step2-walk',
    type: 'method',
    data: {
      label: 'Go for a Walk',
      description: 'Movement-based processing',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 360, y: 650 },
    hidden: true,
  },

  {
    id: 'step2-journal',
    type: 'method',
    data: {
      label: 'Journal',
      description: 'Written exploration',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 540, y: 650 },
    hidden: true,
  },

  {
    id: 'step2-therapy',
    type: 'method',
    data: {
      label: 'Talk Therapy',
      description: 'Professional dialogue',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 300, y: 750 },
    hidden: true,
  },

  {
    id: 'step2-prayer',
    type: 'method',
    data: {
      label: 'Prayer',
      description: 'Spiritual practice',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 480, y: 750 },
    hidden: true,
  },

  {
    id: 'step2-introspection',
    type: 'method',
    data: {
      label: 'Self-Introspection',
      description: 'Inner inquiry',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 600, y: 750 },
    hidden: true,
  },

  {
    id: 'step2-talk',
    type: 'method',
    data: {
      label: 'Talk to Someone',
      description: 'Verbal processing',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 360, y: 850 },
    hidden: true,
  },

  {
    id: 'step2-brainstorm',
    type: 'method',
    data: {
      label: 'Brainstorm',
      description: 'Out loud exploration',
      color: '#af7ac5',
      category: 'Reading Method',
      parentId: 'step2',
    },
    position: { x: 540, y: 850 },
    hidden: true,
  },

  // Somatic Lock Discovery
  {
    id: 'somatic-lock',
    type: 'method',
    data: {
      label: 'Somatic Lock',
      description: 'Precise burden identification',
      color: '#e74c3c',
      category: 'Discovery',
      wikiUrl: 'https://unburdened.earth/wiki/somatic-lock',
      details: 'The exact pattern your body cemented. Multiple threads woven together. You must identify ALL components.',
      parentId: 'step2',
    },
    position: { x: 450, y: 950 },
    hidden: true,
  },

  {
    id: 'lock-components',
    type: 'method',
    data: {
      label: 'Lock Components',
      description: 'ALL strands of sensation',
      color: '#c0392b',
      category: 'Detail',
      details: 'Every thread: the fear of rejection, the memory of being laughed at, the belief you\'re not good enough, the physical sensation in your chest. Miss ONE and the key won\'t work.',
      parentId: 'somatic-lock',
    },
    position: { x: 450, y: 1050 },
    hidden: true,
  },

  // STEP 3: Design Key
  {
    id: 'step3',
    type: 'method',
    data: {
      label: 'STEP 3: Design Key',
      description: 'Cognitive Key Creation',
      color: '#e67e22',
      category: 'Process',
      wikiUrl: 'https://unburdened.earth/wiki/step3-design',
      details: 'Craft a cognitive key that addresses EVERY component of the lock. 90% won\'t work. Must be 100% precise.',
      parentId: 'somatic-lock',
    },
    position: { x: 750, y: 550 },
    hidden: true,
  },

  {
    id: 'step3-mental',
    type: 'method',
    data: {
      label: 'Pure Mental Key',
      description: 'Cognitive reframe only',
      color: '#f39c12',
      category: 'Key Type',
      details: 'A new belief/story that your body accepts as more true than the old one. "I\'m safe now" doesn\'t work. "I\'m safe now BECAUSE..." might.',
      parentId: 'step3',
    },
    position: { x: 700, y: 650 },
    hidden: true,
  },

  {
    id: 'step3-experimental',
    type: 'method',
    data: {
      label: 'Pure Experimental Key',
      description: 'Action-based verification',
      color: '#f39c12',
      category: 'Key Type',
      details: 'Take an action to gather new evidence. Your body needs data, not just stories. Go do the thing that scares you.',
      parentId: 'step3',
    },
    position: { x: 900, y: 650 },
    hidden: true,
  },

  {
    id: 'step3-mixed',
    type: 'method',
    data: {
      label: 'Mixed Key',
      description: 'Thought + Action combined',
      color: '#f39c12',
      category: 'Key Type',
      details: 'Combine new belief with new action. Most powerful approach. Body gets story AND evidence.',
      parentId: 'step3',
    },
    position: { x: 800, y: 750 },
    hidden: true,
  },

  // Key Requirements
  {
    id: 'key-precision',
    type: 'method',
    data: {
      label: 'Precision Required',
      description: '100% match to lock',
      color: '#d35400',
      category: 'Requirement',
      details: 'Like a combination lock - 99% doesn\'t open it. Your key must match the lock EXACTLY.',
      parentId: 'step3',
    },
    position: { x: 750, y: 850 },
    hidden: true,
  },

  {
    id: 'key-addresses-all',
    type: 'method',
    data: {
      label: 'Addresses ALL Components',
      description: 'Every strand of lock',
      color: '#d35400',
      category: 'Requirement',
      details: 'If the lock has 5 components and your key only addresses 4, your body rejects it. "Nice try, but you missed something."',
      parentId: 'step3',
    },
    position: { x: 750, y: 950 },
    hidden: true,
  },

  {
    id: 'key-certainty',
    type: 'method',
    data: {
      label: 'High Certainty',
      description: 'Body must believe it',
      color: '#d35400',
      category: 'Requirement',
      details: 'You must BELIEVE the new story. Not hope it\'s true. KNOW it\'s true. Body detects bullshit instantly.',
      parentId: 'step3',
    },
    position: { x: 750, y: 1050 },
    hidden: true,
  },

  // STEP 4: Implementation
  {
    id: 'step4',
    type: 'method',
    data: {
      label: 'STEP 4: Implement',
      description: 'Apply Cognitive Key',
      color: '#27ae60',
      category: 'Process',
      wikiUrl: 'https://unburdened.earth/wiki/step4-implement',
      details: 'Use your cognitive key. If it\'s the right key, you\'ll feel instant relief. If not, go back to Step 2.',
      parentId: 'step3',
    },
    position: { x: 1050, y: 550 },
    hidden: true,
  },

  {
    id: 'step4-thought',
    type: 'method',
    data: {
      label: 'Repeated Thought',
      description: 'Mental reinforcement',
      color: '#52be80',
      category: 'Implementation',
      parentId: 'step4',
    },
    position: { x: 1000, y: 650 },
    hidden: true,
  },

  {
    id: 'step4-action',
    type: 'method',
    data: {
      label: 'Real-World Action',
      description: 'Behavioral execution',
      color: '#52be80',
      category: 'Implementation',
      parentId: 'step4',
    },
    position: { x: 1180, y: 650 },
    hidden: true,
  },

  {
    id: 'step4-mixed',
    type: 'method',
    data: {
      label: 'Mixed Implementation',
      description: 'Thought + Action',
      color: '#52be80',
      category: 'Implementation',
      parentId: 'step4',
    },
    position: { x: 1090, y: 750 },
    hidden: true,
  },

  // Results
  {
    id: 'result-instant',
    type: 'method',
    data: {
      label: 'Instant Relief',
      description: 'When key matches lock',
      color: '#1abc9c',
      category: 'Result',
      details: 'If your key is right, you feel it INSTANTLY. Not gradual. Instant. Fear → Relief in seconds.',
      parentId: 'step4',
    },
    position: { x: 1050, y: 850 },
    hidden: true,
  },

  {
    id: 'result-aha',
    type: 'method',
    data: {
      label: 'AHA Moment',
      description: '100% certainty achieved',
      color: '#16a085',
      category: 'Result',
      details: 'The moment your body says "YES, that\'s it!" You KNOW you got it. Unmistakable.',
      parentId: 'result-instant',
    },
    position: { x: 1050, y: 950 },
    hidden: true,
  },

  {
    id: 'result-unburdened',
    type: 'method',
    data: {
      label: 'Living Unburdened',
      description: 'BS → US transformation',
      color: '#0e6655',
      category: 'Outcome',
      details: 'The burden is gone. You moved from BS to US. This is the goal. Repeat for every burden.',
      parentId: 'result-aha',
    },
    position: { x: 1050, y: 1050 },
    hidden: true,
  },

  // Key Insights
  {
    id: 'insight-90',
    type: 'method',
    data: {
      label: '90% ≠ Success',
      description: 'Must be 100% precise',
      color: '#34495e',
      category: 'Principle',
      details: 'This is why most methods fail. They get close but not exact. Your body knows the difference.',
    },
    position: { x: 1300, y: 300 },
  },

  {
    id: 'insight-decode-first',
    type: 'method',
    data: {
      label: 'Decode Before Recode',
      description: 'Read body FIRST',
      color: '#34495e',
      category: 'Principle',
      details: 'You can\'t fix what you don\'t understand. Most people try to recode (positive thinking) without decoding (reading the lock).',
    },
    position: { x: 1300, y: 400 },
  },

  {
    id: 'insight-crispr',
    type: 'method',
    data: {
      label: 'Like CRISPR',
      description: 'Precision gene editing for soma',
      color: '#34495e',
      category: 'Analogy',
      details: 'CRISPR edits genes with molecular precision. CIPHER edits somatic patterns with psychological precision.',
    },
    position: { x: 1300, y: 500 },
  },

  {
    id: 'insight-divorce',
    type: 'method',
    data: {
      label: 'Divorced at Birth',
      description: 'Mind/Body split is default',
      color: '#34495e',
      category: 'Core Insight',
      details: 'You weren\'t born knowing how to read your body. The divorce is built in. CIPHER teaches the reunion.',
    },
    position: { x: 1300, y: 600 },
  },
];

const initialEdges: Edge[] = [
  { id: 'e-title-framework', source: 'title', target: 'framework', animated: true },
  { id: 'e-framework-bs', source: 'framework', target: 'bs-signal' },
  { id: 'e-framework-us', source: 'framework', target: 'us-signal' },
  { id: 'e-framework-grid', source: 'framework', target: 'si-grid', animated: true },
  { id: 'e-grid-phantom', source: 'si-grid', target: 'phantom-threat' },
  { id: 'e-grid-clear', source: 'si-grid', target: 'clear-threat' },
  { id: 'e-grid-assumed', source: 'si-grid', target: 'assumed-safety' },
  { id: 'e-grid-grounded', source: 'si-grid', target: 'grounded-safety' },
  { id: 'e-grid-step1', source: 'si-grid', target: 'step1', animated: true, style: { stroke: '#3498db', strokeWidth: 3 } },
  { id: 'e-step1-step2', source: 'step1', target: 'step2', animated: true, style: { stroke: '#9b59b6', strokeWidth: 3 } },
  { id: 'e-step2-step3', source: 'step2', target: 'step3', animated: true, style: { stroke: '#e67e22', strokeWidth: 3 } },
  { id: 'e-step3-step4', source: 'step3', target: 'step4', animated: true, style: { stroke: '#27ae60', strokeWidth: 3 } },
  { id: 'e-s1-thought', source: 'step1', target: 'step1-thought' },
  { id: 'e-s1-situation', source: 'step1', target: 'step1-real-situation' },
  { id: 'e-s1-sensation', source: 'step1', target: 'step1-sensation' },
  { id: 'e-s1-idea', source: 'step1', target: 'step1-idea' },
  { id: 'e-s1-memory', source: 'step1', target: 'step1-memory' },
  { id: 'e-s2-walk', source: 'step2', target: 'step2-walk' },
  { id: 'e-s2-journal', source: 'step2', target: 'step2-journal' },
  { id: 'e-s2-therapy', source: 'step2', target: 'step2-therapy' },
  { id: 'e-s2-prayer', source: 'step2', target: 'step2-prayer' },
  { id: 'e-s2-introspection', source: 'step2', target: 'step2-introspection' },
  { id: 'e-s2-talk', source: 'step2', target: 'step2-talk' },
  { id: 'e-s2-brainstorm', source: 'step2', target: 'step2-brainstorm' },
  { id: 'e-s2-lock', source: 'step2', target: 'somatic-lock', animated: true },
  { id: 'e-lock-components', source: 'somatic-lock', target: 'lock-components' },
  { id: 'e-s3-mental', source: 'step3', target: 'step3-mental' },
  { id: 'e-s3-experimental', source: 'step3', target: 'step3-experimental' },
  { id: 'e-s3-mixed', source: 'step3', target: 'step3-mixed' },
  { id: 'e-s3-precision', source: 'step3', target: 'key-precision' },
  { id: 'e-s3-addresses', source: 'step3', target: 'key-addresses-all' },
  { id: 'e-s3-certainty', source: 'step3', target: 'key-certainty' },
  { id: 'e-s4-thought', source: 'step4', target: 'step4-thought' },
  { id: 'e-s4-action', source: 'step4', target: 'step4-action' },
  { id: 'e-s4-mixed', source: 'step4', target: 'step4-mixed' },
  { id: 'e-s4-instant', source: 'step4', target: 'result-instant', animated: true },
  { id: 'e-instant-aha', source: 'result-instant', target: 'result-aha' },
  { id: 'e-aha-unburdened', source: 'result-aha', target: 'result-unburdened' },
  { id: 'e-lock-key', source: 'lock-components', target: 'step3', style: { stroke: '#e74c3c', strokeWidth: 2, strokeDasharray: '5,5' } },
  { id:
