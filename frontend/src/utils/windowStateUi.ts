export type WindowScaleFixReason = 'activation' | 'ratio-change';

export const shouldToggleMaximisedWindowForScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => reason === 'ratio-change' && hasViewportScaleDrift;
