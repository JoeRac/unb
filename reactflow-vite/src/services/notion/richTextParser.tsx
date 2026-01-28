// Rich Text Parser
// =================
// Parse Notion rich text with formatting into React components

import React from 'react';
import type { NotionRichText, ParsedRichText, RichTextSegment } from './types';

// ============================================
// Rich Text Parsing
// ============================================

/**
 * Parse Notion rich text array into structured segments
 */
export function parseRichText(richText: NotionRichText[] | undefined): ParsedRichText {
  if (!richText || !Array.isArray(richText) || richText.length === 0) {
    return {
      plainText: '',
      segments: [],
      hasFormatting: false,
    };
  }
  
  const segments: RichTextSegment[] = richText.map(rt => ({
    text: rt.text?.content || rt.plain_text || '',
    annotations: rt.annotations || {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    href: rt.href || rt.text?.link?.url || null,
  }));
  
  const hasFormatting = segments.some(seg => 
    seg.annotations.bold ||
    seg.annotations.italic ||
    seg.annotations.strikethrough ||
    seg.annotations.underline ||
    seg.annotations.code ||
    seg.annotations.color !== 'default' ||
    seg.href
  );
  
  return {
    plainText: segments.map(s => s.text).join(''),
    segments,
    hasFormatting,
  };
}

// ============================================
// Color Mapping
// ============================================

const colorMap: Record<string, string> = {
  default: 'inherit',
  gray: '#9ca3af',
  brown: '#a78bfa',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
  gray_background: '#f3f4f6',
  brown_background: '#faf5ff',
  orange_background: '#fff7ed',
  yellow_background: '#fefce8',
  green_background: '#f0fdf4',
  blue_background: '#eff6ff',
  purple_background: '#faf5ff',
  pink_background: '#fdf2f8',
  red_background: '#fef2f2',
};

function getColor(color: string): string {
  return colorMap[color] || 'inherit';
}

function getBackgroundColor(color: string): string | undefined {
  if (color.endsWith('_background')) {
    return colorMap[color];
  }
  return undefined;
}

// ============================================
// React Component Rendering
// ============================================

/**
 * Render a single rich text segment as a React element
 */
function renderSegment(segment: RichTextSegment, index: number): React.ReactNode {
  const { text, annotations, href } = segment;
  
  if (!text) return null;
  
  // Build style object
  const style: React.CSSProperties = {};
  
  if (annotations.color && annotations.color !== 'default') {
    if (annotations.color.endsWith('_background')) {
      style.backgroundColor = getBackgroundColor(annotations.color);
      style.padding = '0 2px';
      style.borderRadius = '2px';
    } else {
      style.color = getColor(annotations.color);
    }
  }
  
  // Build content with nested elements for formatting
  let content: React.ReactNode = text;
  
  if (annotations.code) {
    content = React.createElement('code', {
      key: `code-${index}`,
      style: {
        backgroundColor: '#f1f5f9',
        padding: '0 4px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '0.9em',
      },
    }, content);
  }
  
  if (annotations.strikethrough) {
    content = React.createElement('s', { key: `strike-${index}` }, content);
  }
  
  if (annotations.underline) {
    content = React.createElement('u', { key: `underline-${index}` }, content);
  }
  
  if (annotations.italic) {
    content = React.createElement('em', { key: `italic-${index}` }, content);
  }
  
  if (annotations.bold) {
    content = React.createElement('strong', { key: `bold-${index}` }, content);
  }
  
  // Wrap in link if href exists
  if (href) {
    content = React.createElement('a', {
      key: `link-${index}`,
      href: href,
      target: '_blank',
      rel: 'noopener noreferrer',
      style: {
        color: '#3b82f6',
        textDecoration: 'underline',
        ...style,
      },
    }, content);
  } else if (Object.keys(style).length > 0) {
    content = React.createElement('span', {
      key: `span-${index}`,
      style,
    }, content);
  }
  
  return content;
}

/**
 * Render parsed rich text as React elements
 */
export function renderRichText(parsed: ParsedRichText): React.ReactNode {
  if (!parsed.hasFormatting) {
    return parsed.plainText;
  }
  
  return React.createElement(
    React.Fragment,
    null,
    ...parsed.segments.map((seg, idx) => renderSegment(seg, idx))
  );
}

/**
 * Convenience function to render Notion rich text array directly
 */
export function renderNotionRichText(richText: NotionRichText[] | undefined): React.ReactNode {
  return renderRichText(parseRichText(richText));
}

// ============================================
// Media Parsing
// ============================================

interface ParsedMedia {
  type: 'image' | 'video' | 'embed';
  url: string;
  caption?: string;
  provider?: 'youtube' | 'vimeo' | 'other';
}

/**
 * Parse YouTube URL to extract video ID
 */
export function parseYouTubeUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/v\/([^&\s?]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

/**
 * Parse Vimeo URL to extract video ID
 */
export function parseVimeoUrl(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse media URL and determine type
 */
export function parseMediaUrl(url: string): ParsedMedia {
  // Check for YouTube
  const youtubeId = parseYouTubeUrl(url);
  if (youtubeId) {
    return {
      type: 'video',
      url: `https://www.youtube.com/embed/${youtubeId}`,
      provider: 'youtube',
    };
  }
  
  // Check for Vimeo
  const vimeoId = parseVimeoUrl(url);
  if (vimeoId) {
    return {
      type: 'video',
      url: `https://player.vimeo.com/video/${vimeoId}`,
      provider: 'vimeo',
    };
  }
  
  // Check for image extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const isImage = imageExtensions.some(ext => url.toLowerCase().includes(ext));
  
  if (isImage) {
    return {
      type: 'image',
      url,
    };
  }
  
  // Default to embed
  return {
    type: 'embed',
    url,
    provider: 'other',
  };
}

// ============================================
// Markdown-like Text Parsing
// ============================================

/**
 * Parse simple markdown-like syntax in plain text
 * Supports: **bold**, *italic*, `code`, ~~strikethrough~~, [link](url)
 */
export function parseMarkdownLikeText(text: string): ParsedRichText {
  if (!text) {
    return { plainText: '', segments: [], hasFormatting: false };
  }
  
  const segments: RichTextSegment[] = [];
  let hasFormatting = false;
  
  // Simple regex-based parsing patterns (for future enhancement)
  // const patterns = [
  //   { regex: /\*\*(.+?)\*\*/g, annotation: 'bold' as const },
  //   { regex: /\*(.+?)\*/g, annotation: 'italic' as const },
  //   { regex: /`(.+?)`/g, annotation: 'code' as const },
  //   { regex: /~~(.+?)~~/g, annotation: 'strikethrough' as const },
  //   { regex: /\[(.+?)\]\((.+?)\)/g, annotation: 'link' as const },
  // ];
  
  // For now, just return plain text without parsing
  // (Full implementation would need proper tokenization)
  segments.push({
    text,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    href: null,
  });
  
  return {
    plainText: text,
    segments,
    hasFormatting,
  };
}
