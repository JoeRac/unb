// Data Transformers
// ==================
// Transform data between Notion API format and application format

import type {
  NodeRecord,
  PathRecord,
  NodePathRecord,
  CategoryRecord,
  NotionPage,
  NotionRichText,
  NotionProperty,
  ExternalLink,
  ImageData,
  VideoData,
} from './types';

// ============================================
// Helper Functions
// ============================================

/**
 * Extract plain text from Notion rich text array
 */
export function extractPlainText(richText: NotionRichText[] | undefined): string {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map(rt => rt.plain_text || rt.text?.content || '').join('');
}

/**
 * Extract title from Notion page properties
 */
function extractTitle(property: NotionProperty | undefined): string {
  if (!property || property.type !== 'title') return '';
  return extractPlainText((property as { title: NotionRichText[] }).title);
}

/**
 * Extract rich text from Notion page properties
 */
function extractRichText(property: NotionProperty | undefined): string {
  if (!property || property.type !== 'rich_text') return '';
  return extractPlainText((property as { rich_text: NotionRichText[] }).rich_text);
}

/**
 * Extract checkbox value
 */
function extractCheckbox(property: NotionProperty | undefined): boolean {
  if (!property || property.type !== 'checkbox') return false;
  return (property as { checkbox: boolean }).checkbox;
}

/**
 * Extract URL value
 */
function extractUrl(property: NotionProperty | undefined): string {
  if (!property || property.type !== 'url') return '';
  return (property as { url: string | null }).url || '';
}

/**
 * Extract select value
 */
function extractSelect(property: NotionProperty | undefined): string {
  if (!property || property.type !== 'select') return '';
  const select = (property as { select: { name: string } | null }).select;
  return select?.name || '';
}

/**
 * Extract status value
 */
function extractStatus(property: NotionProperty | undefined): string {
  if (!property || property.type !== 'status') return '';
  const status = (property as { status?: { name: string } | null }).status;
  return status?.name || '';
}

/**
 * Extract date value
 */
function extractDate(property: NotionProperty | undefined): string {
  if (!property || property.type !== 'date') return '';
  return (property as { date: { start: string } | null }).date?.start || '';
}

/**
 * Parse JSON safely, returning default value on error
 */
function safeParseJSON<T>(value: string, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Parse external links from JSON string
 */
function parseExternalLinks(value: string): ExternalLink[] {
  const parsed = safeParseJSON<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is ExternalLink => 
    typeof item === 'object' && item !== null && 
    typeof (item as ExternalLink).label === 'string' && 
    typeof (item as ExternalLink).url === 'string'
  );
}

/**
 * Parse images from JSON string
 */
function parseImages(value: string): ImageData[] {
  const parsed = safeParseJSON<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is ImageData => 
    typeof item === 'object' && item !== null && 
    typeof (item as ImageData).src === 'string'
  );
}

/**
 * Parse video from JSON string
 */
function parseVideo(value: string): VideoData | undefined {
  if (!value) return undefined;
  const parsed = safeParseJSON<VideoData | null>(value, null);
  if (!parsed || typeof parsed !== 'object') return undefined;
  if (!['youtube', 'vimeo', 'html5'].includes(parsed.type)) return undefined;
  if (typeof parsed.url !== 'string') return undefined;
  return parsed;
}

/**
 * Parse parent IDs from comma-separated string or JSON array
 */
function parseParentIds(value: string): string[] {
  if (!value) return [];
  
  // Try JSON array first
  const jsonParsed = safeParseJSON<string[]>(value, []);
  if (jsonParsed.length > 0) return jsonParsed;
  
  // Fall back to comma-separated
  return value.split(',').map(id => id.trim()).filter(Boolean);
}

/**
 * Parse node IDs from comma-separated string
 */
function parseNodeIds(value: string): string[] {
  if (!value) return [];
  return value.split(',').map(id => id.trim()).filter(Boolean);
}

// ============================================
// Notion Page to Record Transformers
// ============================================

/**
 * Transform Notion page to NodeRecord
 */
export function notionPageToNode(page: NotionPage): NodeRecord {
  const props = page.properties;
  
  return {
    id: extractTitle(props['id']) || extractRichText(props['id']) || page.id,
    notionPageId: page.id,
    parentIds: parseParentIds(extractRichText(props['parentIds']) || extractRichText(props['parentId'])),
    label: extractRichText(props['label']) || extractTitle(props['Name']) || '',
    category: extractRichText(props['category']) || extractSelect(props['category']) || '',
    color: extractRichText(props['color']) || '#6b7280',
    wikiUrl: extractUrl(props['wikiUrl']) || extractRichText(props['wikiUrl']) || '',
    description: extractRichText(props['description']) || '',
    details: extractRichText(props['details']) || '',
    longDescription: extractRichText(props['longDescription']) || '',
    externalLinks: parseExternalLinks(extractRichText(props['externalLinks'])),
    images: parseImages(extractRichText(props['images'])),
    video: parseVideo(extractRichText(props['video'])),
    hidden_by_default: extractCheckbox(props['hidden_by_default']) || 
                       extractRichText(props['hidden_by_default'])?.toLowerCase() === 'true',
    lastModified: page.last_edited_time,
  };
}

/**
 * Transform Notion page to PathRecord
 */
export function notionPageToPath(page: NotionPage): PathRecord {
  const props = page.properties;
  
  // Get the ID - could be in 'id' property or use the page id
  let id = extractTitle(props['id']) || extractRichText(props['id']);
  // Remove leading quote if present (from Google Sheets migration)
  if (id?.startsWith("'")) id = id.slice(1);
  if (!id) id = page.id;
  
  // Get the name
  let name = extractTitle(props['name']) || extractRichText(props['name']) || extractTitle(props['Name']);
  if (name?.startsWith("'")) name = name.slice(1);
  
  // Get nodeIds
  const nodeIdsRaw = extractRichText(props['nodeIds']) || extractRichText(props['node_ids']);
  
  return {
    id,
    notionPageId: page.id,
    name,
    nodeIds: parseNodeIds(nodeIdsRaw),
    category: extractRichText(props['category']) || extractSelect(props['category']) || undefined,
    subcategory: extractRichText(props['subcategory']) || extractSelect(props['subcategory']) || undefined,
    subsubcategory: extractRichText(props['subsubcategory']) || extractSelect(props['subsubcategory']) || undefined,
    notes: extractRichText(props['notes']) || extractRichText(props['Notes']) || undefined,
    status: extractStatus(props['status']) || extractSelect(props['status']) || extractRichText(props['status']) || undefined,
    dateUpdated: extractDate(props['date_updated']) || extractDate(props['dateUpdated']) || undefined,
    lastModified: page.last_edited_time,
  };
}

/**
 * Transform Notion page to NodePathRecord
 */
export function notionPageToNodePath(page: NotionPage): NodePathRecord {
  const props = page.properties;
  
  const pathId = extractRichText(props['pathId']) || extractTitle(props['pathId']) || '';
  const nodeId = extractRichText(props['nodeId']) || extractTitle(props['nodeId']) || '';
  
  return {
    id: `${pathId}_${nodeId}`,
    notionPageId: page.id,
    pathId,
    nodeId,
    content: extractRichText(props['content']) || '',
    lastModified: page.last_edited_time,
  };
}

// ============================================
// Record to Notion Properties Transformers
// ============================================

/**
 * Create Notion rich text property
 */
function createRichTextProperty(value: string): { rich_text: Array<{ text: { content: string } }> } {
  return {
    rich_text: [{ text: { content: value || '' } }],
  };
}

/**
 * Create Notion title property
 */
function createTitleProperty(value: string): { title: Array<{ text: { content: string } }> } {
  return {
    title: [{ text: { content: value || '' } }],
  };
}

/**
 * Create Notion checkbox property
 */
function createCheckboxProperty(value: boolean): { checkbox: boolean } {
  return { checkbox: value };
}

/**
 * Create Notion status property
 */
function createStatusProperty(value: string): { status: { name: string } } {
  return { status: { name: value || 'active' } };
}

/**
 * Create Notion date property
 */
function createDateProperty(value: string | Date): { date: { start: string } } {
  const iso = value instanceof Date ? value.toISOString() : value;
  return { date: { start: iso } };
}

/**
 * Transform NodeRecord to Notion properties for create/update
 */
export function nodeToNotionProperties(node: Partial<NodeRecord>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  
  if (node.id !== undefined) {
    props['id'] = createTitleProperty(node.id);
  }
  if (node.parentIds !== undefined) {
    props['parentIds'] = createRichTextProperty(node.parentIds.join(', '));
  }
  if (node.label !== undefined) {
    props['label'] = createRichTextProperty(node.label);
  }
  if (node.category !== undefined) {
    props['category'] = createRichTextProperty(node.category);
  }
  if (node.color !== undefined) {
    props['color'] = createRichTextProperty(node.color);
  }
  if (node.wikiUrl !== undefined) {
    props['wikiUrl'] = createRichTextProperty(node.wikiUrl);
  }
  if (node.description !== undefined) {
    props['description'] = createRichTextProperty(node.description);
  }
  if (node.details !== undefined) {
    props['details'] = createRichTextProperty(node.details);
  }
  if (node.longDescription !== undefined) {
    props['longDescription'] = createRichTextProperty(node.longDescription);
  }
  if (node.externalLinks !== undefined) {
    props['externalLinks'] = createRichTextProperty(JSON.stringify(node.externalLinks));
  }
  if (node.images !== undefined) {
    props['images'] = createRichTextProperty(JSON.stringify(node.images));
  }
  if (node.video !== undefined) {
    props['video'] = createRichTextProperty(JSON.stringify(node.video));
  }
  if (node.hidden_by_default !== undefined) {
    props['hidden_by_default'] = createCheckboxProperty(node.hidden_by_default);
  }
  
  return props;
}

/**
 * Transform PathRecord to Notion properties for create/update
 */
export function pathToNotionProperties(path: Partial<PathRecord>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  
  if (path.id !== undefined) {
    props['id'] = createTitleProperty(path.id);
  }
  if (path.name !== undefined) {
    props['name'] = createRichTextProperty(path.name);
  }
  if (path.nodeIds !== undefined) {
    // Format nodeIds with trailing comma if single item (prevents number interpretation)
    const nodeIdsStr = path.nodeIds.length === 1 
      ? path.nodeIds[0] + ','
      : path.nodeIds.join(', ');
    props['nodeIds'] = createRichTextProperty(nodeIdsStr);
  }
  if (path.category !== undefined) {
    props['category'] = createRichTextProperty(path.category || '');
  }
  if (path.subcategory !== undefined) {
    props['subcategory'] = createRichTextProperty(path.subcategory || '');
  }
  if (path.subsubcategory !== undefined) {
    props['subsubcategory'] = createRichTextProperty(path.subsubcategory || '');
  }
  if (path.notes !== undefined) {
    props['notes'] = createRichTextProperty(path.notes || '');
  }
  if (path.status !== undefined) {
    props['status'] = createStatusProperty(path.status || 'active');
  }
  if (path.dateUpdated !== undefined) {
    props['date_updated'] = createDateProperty(path.dateUpdated || new Date().toISOString());
  }
  
  return props;
}

/**
 * Transform NodePathRecord to Notion properties for create/update
 */
export function nodePathToNotionProperties(nodePath: Partial<NodePathRecord>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  
  // Use pathId_nodeId as the title/id
  if (nodePath.pathId !== undefined && nodePath.nodeId !== undefined) {
    props['id'] = createTitleProperty(`${nodePath.pathId}_${nodePath.nodeId}`);
  }
  if (nodePath.pathId !== undefined) {
    props['pathId'] = createRichTextProperty(nodePath.pathId);
  }
  if (nodePath.nodeId !== undefined) {
    props['nodeId'] = createRichTextProperty(nodePath.nodeId);
  }
  if (nodePath.content !== undefined) {
    props['content'] = createRichTextProperty(nodePath.content);
  }
  
  return props;
}

// ============================================
// Category Transformers
// ============================================

/**
 * Transform Notion page to CategoryRecord
 * Note: 'name' is the title property, 'id' is a rich text property
 */
export function notionPageToCategory(page: NotionPage): CategoryRecord {
  const props = page.properties;

  // Extract name from title property
  const name = extractTitle(props['name']) || extractTitle(props['Name']) || '';

  // Extract id from rich text property, fallback to page id
  let id = extractRichText(props['id']) || extractRichText(props['Id']);
  if (id?.startsWith("'")) id = id.slice(1);
  if (!id) id = page.id;

  // Extract parentId from Notion relation property (should be a single relation)
  let parentId: string | null = null;
  const parentProp = props['parent'];
  if (parentProp && parentProp.type === 'relation' && Array.isArray((parentProp as any).relation) && (parentProp as any).relation.length > 0) {
    parentId = (parentProp as any).relation[0]?.id || null;
  }

  console.log('Parsed category:', { id, name, parentId, pageId: page.id });

  return {
    id,
    notionPageId: page.id,
    name,
    parentId,
  };
}

/**
 * Transform array of Notion pages to CategoryRecords
 */
export function notionPagesToCategories(pages: NotionPage[]): CategoryRecord[] {
  return pages.map(notionPageToCategory);
}

/**
 * Transform CategoryRecord to Notion properties for create/update
 * Note: In Notion, 'name' is typically the title property for a Categories database
 */
export function categoryToNotionProperties(category: Partial<CategoryRecord>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  
  // 'name' is the title property (required in Notion)
  if (category.name !== undefined) {
    props['name'] = createTitleProperty(category.name);
  }
  // 'id' is a rich text property to store our app-generated ID
  if (category.id !== undefined) {
    props['id'] = createRichTextProperty(category.id);
  }
  // 'parent' is a relation property (array of Notion page IDs)
  if (category.parentId !== undefined) {
    props['parent'] = {
      relation: category.parentId ? [{ id: category.parentId }] : [],
    };
  }
  return props;
}

// ============================================
// Batch Transformers
// ============================================

/**
 * Transform array of Notion pages to NodeRecords
 */
export function notionPagesToNodes(pages: NotionPage[]): NodeRecord[] {
  return pages.map(notionPageToNode);
}

/**
 * Transform array of Notion pages to PathRecords
 */
export function notionPagesToPaths(pages: NotionPage[]): PathRecord[] {
  return pages.map(notionPageToPath);
}

/**
 * Transform array of Notion pages to NodePathRecords
 */
export function notionPagesToNodePaths(pages: NotionPage[]): NodePathRecord[] {
  return pages.map(notionPageToNodePath);
}
