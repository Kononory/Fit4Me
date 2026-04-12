export type LocaleStatus = 'fit' | 'overflow' | 'collision' | 'frame_overflow';

export interface LocaleResult {
  translated: string;
  status: LocaleStatus;
  expandedH?: number;
  collidesWith?: string[];
  isRtl: boolean;
}

export interface TextNodeResult {
  id: string; name: string; original: string;
  x: number; y: number; w: number; h: number;
  locales: Record<string, LocaleResult>;
}

export interface LocaleCheckResponse {
  frameW: number; frameH: number;
  results: TextNodeResult[];
}
