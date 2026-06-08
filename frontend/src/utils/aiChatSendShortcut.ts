import { DEFAULT_SHORTCUT_OPTIONS, getShortcutDisplay, isShortcutMatch, type ShortcutBinding } from './shortcuts';
import { translate, type AppLanguage } from '../i18n';

export interface AIChatSendShortcutKeyEventLike {
  key?: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export const getAIChatSendShortcutLabel = (binding: ShortcutBinding | undefined, language: AppLanguage = 'en'): string => {
  if (binding?.enabled === false) {
    return translate(language, 'ai.input.shortcut.disabled');
  }
  const combo = binding?.combo || DEFAULT_SHORTCUT_OPTIONS.sendAIChatMessage.combo;
  return translate(language, 'ai.input.shortcut.send', { shortcut: getShortcutDisplay(combo) });
};

export const shouldSendAIChatOnKeyDown = (
  binding: ShortcutBinding | undefined,
  event: AIChatSendShortcutKeyEventLike,
): boolean => {
  if (!binding?.enabled) {
    return false;
  }
  if (event.shiftKey || event.isComposing || event.nativeEvent?.isComposing) {
    return false;
  }
  return isShortcutMatch(event as KeyboardEvent, binding.combo);
};

export const consumeAIChatSendShortcutOnKeyDown = (
  binding: ShortcutBinding | undefined,
  event: AIChatSendShortcutKeyEventLike,
  onSend: () => void,
): boolean => {
  if (!shouldSendAIChatOnKeyDown(binding, event)) {
    return false;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  onSend();
  return true;
};
