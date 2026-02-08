// NotionPageRenderer
// ====================
// Renders Notion page blocks (paragraphs, headings, lists, images, etc.) as React elements.
// Used in the focus-mode right panel to display documentation fetched from the Notion API.

import React, { useEffect, useState, useCallback } from 'react';
import type { NotionRichText } from '../services/notion/types';

// ============================================
// Rich-text helpers
// ============================================

function renderAnnotatedText(rt: NotionRichText, idx: number): React.ReactNode {
  const { annotations, href, plain_text, text } = rt;
  if (!plain_text && !text?.content) return null;

  const content = plain_text || text?.content || '';

  const style: React.CSSProperties = {};
  if (annotations?.color && annotations.color !== 'default') {
    if (annotations.color.endsWith('_background')) {
      style.backgroundColor = COLOR_MAP[annotations.color] || undefined;
      style.padding = '0 2px';
      style.borderRadius = '2px';
    } else {
      style.color = COLOR_MAP[annotations.color] || undefined;
    }
  }

  let node: React.ReactNode = content;

  if (annotations?.code) {
    node = (
      <code
        key={`c-${idx}`}
        style={{
          backgroundColor: '#f1f5f9',
          padding: '1px 5px',
          borderRadius: '4px',
          fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '0.88em',
        }}
      >
        {node}
      </code>
    );
  }
  if (annotations?.strikethrough) node = <s key={`s-${idx}`}>{node}</s>;
  if (annotations?.underline) node = <u key={`u-${idx}`}>{node}</u>;
  if (annotations?.italic) node = <em key={`i-${idx}`}>{node}</em>;
  if (annotations?.bold) node = <strong key={`b-${idx}`}>{node}</strong>;

  if (href || text?.link?.url) {
    const url = href || text?.link?.url || '';
    node = (
      <a
        key={`a-${idx}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#3b82f6', textDecoration: 'underline', ...style }}
      >
        {node}
      </a>
    );
  } else if (Object.keys(style).length > 0) {
    node = (
      <span key={`sp-${idx}`} style={style}>
        {node}
      </span>
    );
  }

  return node;
}

function renderRichTextArray(richText: NotionRichText[] | undefined): React.ReactNode {
  if (!richText || richText.length === 0) return null;
  return richText.map((rt, i) => renderAnnotatedText(rt, i));
}

function richTextToPlain(richText: NotionRichText[] | undefined): string {
  if (!richText) return '';
  return richText.map((rt) => rt.plain_text || rt.text?.content || '').join('');
}

const COLOR_MAP: Record<string, string> = {
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

// ============================================
// Block renderers
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */
function renderBlock(block: any, index: number): React.ReactNode {
  const type: string = block.type;

  switch (type) {
    // ---- Text blocks ----
    case 'paragraph': {
      const rt = block.paragraph?.rich_text;
      if (!rt || rt.length === 0) return <div key={index} style={{ height: '0.75em' }} />;
      return (
        <p key={index} style={{ margin: '6px 0', lineHeight: 1.7, fontSize: '13px', color: '#334155' }}>
          {renderRichTextArray(rt)}
        </p>
      );
    }

    case 'heading_1': {
      const rt = block.heading_1?.rich_text;
      return (
        <h1
          key={index}
          style={{
            fontSize: '20px',
            fontWeight: 700,
            margin: '20px 0 8px',
            color: '#0f172a',
            borderBottom: '1px solid rgba(226,232,240,0.6)',
            paddingBottom: '6px',
          }}
        >
          {renderRichTextArray(rt)}
        </h1>
      );
    }

    case 'heading_2': {
      const rt = block.heading_2?.rich_text;
      return (
        <h2
          key={index}
          style={{ fontSize: '17px', fontWeight: 650, margin: '16px 0 6px', color: '#1e293b' }}
        >
          {renderRichTextArray(rt)}
        </h2>
      );
    }

    case 'heading_3': {
      const rt = block.heading_3?.rich_text;
      return (
        <h3
          key={index}
          style={{ fontSize: '15px', fontWeight: 600, margin: '12px 0 4px', color: '#334155' }}
        >
          {renderRichTextArray(rt)}
        </h3>
      );
    }

    // ---- Lists ----
    case 'bulleted_list_item': {
      const rt = block.bulleted_list_item?.rich_text;
      return (
        <li
          key={index}
          style={{ margin: '3px 0', lineHeight: 1.7, fontSize: '13px', color: '#334155', listStyleType: 'disc', marginLeft: '20px' }}
        >
          {renderRichTextArray(rt)}
        </li>
      );
    }

    case 'numbered_list_item': {
      const rt = block.numbered_list_item?.rich_text;
      return (
        <li
          key={index}
          style={{ margin: '3px 0', lineHeight: 1.7, fontSize: '13px', color: '#334155', listStyleType: 'decimal', marginLeft: '20px' }}
        >
          {renderRichTextArray(rt)}
        </li>
      );
    }

    case 'to_do': {
      const rt = block.to_do?.rich_text;
      const checked = block.to_do?.checked ?? false;
      return (
        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '3px 0', fontSize: '13px', color: '#334155' }}>
          <span style={{ marginTop: '2px', opacity: checked ? 0.6 : 1 }}>{checked ? '☑' : '☐'}</span>
          <span style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.6 : 1 }}>
            {renderRichTextArray(rt)}
          </span>
        </div>
      );
    }

    case 'toggle': {
      const rt = block.toggle?.rich_text;
      return (
        <details key={index} style={{ margin: '4px 0', fontSize: '13px', color: '#334155' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500 }}>{renderRichTextArray(rt)}</summary>
        </details>
      );
    }

    // ---- Quote & callout ----
    case 'quote': {
      const rt = block.quote?.rich_text;
      return (
        <blockquote
          key={index}
          style={{
            margin: '8px 0',
            padding: '8px 14px',
            borderLeft: '3px solid #3b82f6',
            background: 'rgba(59,130,246,0.04)',
            borderRadius: '0 6px 6px 0',
            fontSize: '13px',
            color: '#475569',
            lineHeight: 1.7,
          }}
        >
          {renderRichTextArray(rt)}
        </blockquote>
      );
    }

    case 'callout': {
      const icon = block.callout?.icon?.emoji || '💡';
      const rt = block.callout?.rich_text;
      const bgColor = block.callout?.color ? COLOR_MAP[block.callout.color + '_background'] || 'rgba(248,250,252,0.8)' : 'rgba(248,250,252,0.8)';
      return (
        <div
          key={index}
          style={{
            display: 'flex',
            gap: '10px',
            padding: '12px 14px',
            margin: '8px 0',
            background: bgColor,
            borderRadius: '8px',
            border: '1px solid rgba(226,232,240,0.6)',
            fontSize: '13px',
            color: '#334155',
            lineHeight: 1.7,
          }}
        >
          <span style={{ fontSize: '18px', flexShrink: 0 }}>{icon}</span>
          <div>{renderRichTextArray(rt)}</div>
        </div>
      );
    }

    // ---- Code ----
    case 'code': {
      const rt = block.code?.rich_text;
      const lang = block.code?.language || '';
      return (
        <div key={index} style={{ margin: '8px 0' }}>
          {lang && (
            <div
              style={{
                fontSize: '10px',
                color: '#64748b',
                background: '#1e293b',
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px 4px 0 0',
                fontFamily: 'monospace',
              }}
            >
              {lang}
            </div>
          )}
          <pre
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              padding: '14px',
              borderRadius: lang ? '0 8px 8px 8px' : '8px',
              fontSize: '12px',
              lineHeight: 1.6,
              overflow: 'auto',
              fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace',
            }}
          >
            <code>{richTextToPlain(rt)}</code>
          </pre>
        </div>
      );
    }

    // ---- Divider ----
    case 'divider':
      return <hr key={index} style={{ border: 'none', borderTop: '1px solid rgba(226,232,240,0.6)', margin: '12px 0' }} />;

    // ---- Image ----
    case 'image': {
      const url =
        block.image?.file?.url ||
        block.image?.external?.url ||
        '';
      const caption = richTextToPlain(block.image?.caption);
      return (
        <figure key={index} style={{ margin: '12px 0' }}>
          {url && (
            <img
              src={url}
              alt={caption || 'image'}
              style={{
                maxWidth: '100%',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                border: '1px solid rgba(226,232,240,0.6)',
              }}
            />
          )}
          {caption && (
            <figcaption style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>
              {caption}
            </figcaption>
          )}
        </figure>
      );
    }

    // ---- Video ----
    case 'video': {
      const url =
        block.video?.external?.url ||
        block.video?.file?.url ||
        '';
      if (!url) return null;

      // YouTube embed
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      if (ytMatch) {
        return (
          <div key={index} style={{ margin: '12px 0', aspectRatio: '16/9' }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytMatch[1]}`}
              style={{ width: '100%', height: '100%', borderRadius: '8px', border: '1px solid rgba(226,232,240,0.6)' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
      return (
        <video
          key={index}
          controls
          src={url}
          style={{ maxWidth: '100%', borderRadius: '8px', margin: '12px 0', border: '1px solid rgba(226,232,240,0.6)' }}
        />
      );
    }

    // ---- Embed / bookmark ----
    case 'embed': {
      const url = block.embed?.url || '';
      return (
        <div key={index} style={{ margin: '8px 0' }}>
          <iframe
            src={url}
            style={{
              width: '100%',
              minHeight: '300px',
              borderRadius: '8px',
              border: '1px solid rgba(226,232,240,0.6)',
            }}
            allowFullScreen
          />
        </div>
      );
    }

    case 'bookmark': {
      const url = block.bookmark?.url || '';
      const caption = richTextToPlain(block.bookmark?.caption);
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            margin: '6px 0',
            background: 'rgba(255,255,255,0.9)',
            borderRadius: '8px',
            color: '#2563eb',
            fontWeight: 500,
            fontSize: '13px',
            textDecoration: 'none',
            border: '1px solid rgba(226,232,240,0.6)',
            transition: 'background 0.15s',
          }}
        >
          <span>🔗</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {caption || url}
          </span>
          <span style={{ opacity: 0.6 }}>↗</span>
        </a>
      );
    }

    // ---- Table ----
    case 'table': {
      // Table blocks have children (table_row). We'll render a placeholder.
      return (
        <div
          key={index}
          style={{
            margin: '8px 0',
            padding: '10px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid rgba(226,232,240,0.6)',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          📊 Table (view in Notion for full formatting)
        </div>
      );
    }

    // ---- Column list / columns (multi-column layout) ----
    case 'column_list':
    case 'column':
      return null; // Nested children would require recursive fetching

    // ---- Equation ----
    case 'equation': {
      const expr = block.equation?.expression || '';
      return (
        <div
          key={index}
          style={{
            margin: '8px 0',
            textAlign: 'center',
            padding: '10px',
            background: '#f8fafc',
            borderRadius: '8px',
            fontFamily: 'serif',
            fontSize: '16px',
          }}
        >
          {expr}
        </div>
      );
    }

    // ---- Table of contents (skip) ----
    case 'table_of_contents':
      return null;

    // ---- Unsupported / fallback ----
    default:
      return null;
  }
}

// ============================================
// Main component
// ============================================

interface NotionPageRendererProps {
  blocks: unknown[];
  isLoading: boolean;
  error: string | null;
  accentColor?: string;
  onRetry?: () => void;
  /** Fallback: HTML description from node properties (shown when page body is empty) */
  fallbackDescription?: string;
  /** Fallback: images from node properties */
  fallbackImages?: { src: string; alt?: string }[];
  /** Fallback: video from node properties */
  fallbackVideo?: { type: string; url: string };
}

export default function NotionPageRenderer({
  blocks,
  isLoading,
  error,
  accentColor = '#3b82f6',
  onRetry,
  fallbackDescription,
  fallbackImages,
  fallbackVideo,
}: NotionPageRendererProps) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: '12px' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            border: `3px solid ${accentColor}20`,
            borderTopColor: accentColor,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Loading page content…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#ef4444',
          fontSize: '12px',
          background: 'rgba(254,242,242,0.5)',
          borderRadius: '8px',
          border: '1px solid rgba(254,202,202,0.4)',
          margin: '8px',
        }}
      >
        <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>⚠️</span>
        <p style={{ margin: '0 0 8px' }}>{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!blocks || blocks.length === 0) {
    // Check if we have fallback content from node properties
    const hasFallback = fallbackDescription || (fallbackImages && fallbackImages.length > 0) || fallbackVideo;

    if (hasFallback) {
      return (
        <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#334155' }}>
          {fallbackDescription && (
            <div
              style={{
                margin: '0 0 12px',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.9)',
                borderRadius: '8px',
                borderLeft: `3px solid ${accentColor}`,
                border: '1px solid rgba(226,232,240,0.6)',
                borderLeftWidth: '3px',
                borderLeftColor: accentColor,
              }}
              dangerouslySetInnerHTML={{ __html: fallbackDescription }}
            />
          )}
          {fallbackImages?.map((img) => (
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
          {fallbackVideo && (() => {
            const ytMatch = fallbackVideo.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
            if (ytMatch) {
              return (
                <div style={{ aspectRatio: '16/9', margin: '0 0 12px' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                    style={{ width: '100%', height: '100%', borderRadius: '8px', border: '1px solid rgba(226,232,240,0.6)' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            }
            if (fallbackVideo.type === 'html5') {
              return <video controls src={fallbackVideo.url} style={{ width: '100%', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(226,232,240,0.6)' }} />;
            }
            return (
              <iframe
                src={fallbackVideo.url}
                style={{ width: '100%', aspectRatio: '16/9', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(226,232,240,0.6)' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            );
          })()}
          <div style={{ fontSize: '10px', color: '#b0b8c4', textAlign: 'center', marginTop: '8px', fontStyle: 'italic' }}>
            Showing data from node properties. Add content to the page body in Notion for richer documentation.
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#94a3b8',
          fontSize: '12px',
          background: 'rgba(248,250,252,0.5)',
          borderRadius: '8px',
          border: '1px solid rgba(226,232,240,0.4)',
        }}
      >
        <span style={{ fontSize: '28px', display: 'block', marginBottom: '10px', opacity: 0.4 }}>📄</span>
        <p style={{ margin: 0 }}>This page has no body content yet.</p>
        <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#b0b8c4' }}>
          Open this page in Notion and add content to see it here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#334155' }}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

// ============================================
// Hook: useNotionPageContent
// ============================================

/**
 * Hook to fetch and cache Notion page content for a given notionPageId / nodeName.
 * Returns { blocks, isLoading, error, retry }.
 */
export function useNotionPageContent(
  notionPageId: string | undefined,
  nodeName: string | undefined,
  fetchFn: (pageId?: string, name?: string) => Promise<{ blocks: unknown[]; pageId: string | null }>,
) {
  const [blocks, setBlocks] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!notionPageId && !nodeName) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchFn(notionPageId, nodeName);
      setBlocks(result.blocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page content');
    } finally {
      setIsLoading(false);
    }
  }, [notionPageId, nodeName, fetchFn]);

  useEffect(() => {
    load();
  }, [load]);

  return { blocks, isLoading, error, retry: load };
}
