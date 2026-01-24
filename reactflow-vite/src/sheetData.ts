// This file will contain utility functions to fetch and transform Google Sheets data for the diagram.
import type { Node, Edge } from '@xyflow/react';

export async function fetchSheetData(sheetId: string, apiKey: string, range: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch Google Sheet data');
  const data = await res.json();
  // TODO: Transform data.values into nodes and edges arrays
  // This will depend on your sheet structure
  return { nodes: [], edges: [] };
}
