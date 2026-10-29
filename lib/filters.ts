import type { AiEffect, FaceProp, FilterName } from '@/types/room';

export const FILTERS: FilterName[] = ['none', 'grayscale', 'sepia', 'vintage', 'cool', 'warm', 'highContrast'];
export const AI_EFFECTS: AiEffect[] = ['none', 'blur', 'replace-pink', 'replace-mint', 'replace-custom'];
export const FACE_PROPS: FaceProp[] = ['none', 'glasses', 'ears', 'hat'];

export function isFilterName(value: unknown): value is FilterName {
  return typeof value === 'string' && (FILTERS as string[]).includes(value);
}

// CSS approximations of the server-side sharp filters, for the live camera
// preview only. The captured photo is still graded by sharp on the server
// (/api/photos/filter), so the result can differ slightly from the preview.
export const FILTER_CSS: Record<FilterName, string> = {
  none: 'none',
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.85) saturate(1.1)',
  vintage: 'sepia(0.35) saturate(0.7) contrast(1.05) brightness(1.05)',
  cool: 'saturate(1.15) hue-rotate(-8deg) brightness(1.02)',
  warm: 'saturate(1.15) hue-rotate(10deg) brightness(1.03)',
  highContrast: 'contrast(1.4) saturate(1.1)',
};
