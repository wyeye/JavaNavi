import { DEFAULT_SHORTCUT_OPTIONS, getShortcutDisplay, isShortcutMatch, type ShortcutBinding } from './shortcuts';

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

export const getAIChatSendShortcutLabel = (binding: ShortcutBinding | undefined): string => {
  if (binding?.enabled === false) {
    return '快捷键发送已关闭';
  }
  const combo = binding?.combo || DEFAULT_SHORTCUT_OPTIONS.sendAIChatMessage.combo;
  return `${getShortcutDisplay(combo)} 发送`;
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
