export const METADATA_ORIGIN = 'https://export.arxiv.org/*';
export const MAX_METADATA_IDS = 50;
export const MAX_METADATA_RESPONSE_BYTES = 2_000_000;

export type MetadataError = 'permissionDenied' | 'network' | 'timeout' | 'http'
  | 'invalidRequest' | 'tooLarge' | 'cancelled' | 'busy';
export type MetadataResponse = { ok: true; xml: string } | { ok: false; error: MetadataError };
