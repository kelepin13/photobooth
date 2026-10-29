export type FilterName = 'none' | 'grayscale' | 'sepia' | 'vintage' | 'cool' | 'warm' | 'highContrast';
export type AiEffect = 'none' | 'blur' | 'replace-pink' | 'replace-mint' | 'replace-custom';
// Face-anchored props, drawn from MediaPipe Face Landmarker positions —
// independent of (and combinable with) the background AiEffect above.
export type FaceProp = 'none' | 'glasses' | 'ears' | 'hat';
export type Layout = '2x2' | '1x4' | '1x2' | '2x3';

export interface Participant {
  name: string;
  ready: boolean;
}

export interface RoomInfo {
  code: string;
  slots: (string | null)[];
  layout: Layout;
  columns: number;
  hasPin: boolean;
  joinUrl: string;
  qrDataUrl: string;
}

export interface CaptureLock {
  socketId: string;
  name: string;
  slotIndex: number;
}
