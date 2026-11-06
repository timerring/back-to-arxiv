export const METADATA_ORIGIN = 'https://export.arxiv.org/*';
export const MAX_METADATA_IDS = 50;
export const MAX_METADATA_RESPONSE_BYTES = 2_000_000;

export type MetadataError = 'permissionDenied' | 'network' | 'timeout' | 'http'
  | 'invalidRequest' | 'tooLarge' | 'cancelled' | 'busy';
export type MetadataResponse = { ok: true; xml: string } | { ok: false; error: MetadataError };

export type MetadataRequest = { type: 'FETCH_CITATION_METADATA'; requestId: string; ids: string[] }
  | { type: 'CANCEL_CITATION_METADATA'; requestId: string };
export type ArxivSearchRequest = { type: 'SEARCH_ARXIV'; requestId: string; query: string; start: number }
  | { type: 'CANCEL_ARXIV_SEARCH'; requestId: string };
