import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { I18nKey } from '../i18n';

export type ShortcutAction =
  | 'runQuery'
  | 'saveQuery'
  | 'sendAIChatMessage'
  | 'focusSidebarSearch'
  | 'newQueryTab'
  | 'toggleLogPanel'
  | 'toggleTheme'
  | 'openShortcutManager'
  | 'toggleMacFullscreen';

export interface ShortcutBinding {
  combo: string;
  enabled: boolean;
}

export type ShortcutOptions = Record<ShortcutAction, ShortcutBinding>;

export interface ShortcutActionMeta {
  allowInEditable?: boolean;
  allowWithoutModifier?: boolean;
  scope?: 'global' | 'aiComposer' | 'queryEditor';
  requiredKey?: string;
  disallowShift?: boolean;
  platformOnly?: 'mac';
}

const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const;
const MODIFIER_SET = new Set(MODIFIER_ORDER);

const KEY_ALIASES: Record<string, string> = {
  control: 'Ctrl',
  ctrl: 'Ctrl',
  command: 'Meta',
  cmd: 'Meta',
  meta: 'Meta',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  escape: 'Esc',
  esc: 'Esc',
  return: 'Enter',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  ' ': 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  arrowup: 'Up',
  up: 'Up',
  arrowdown: 'Down',
  down: 'Down',
  arrowleft: 'Left',
  left: 'Left',
  arrowright: 'Right',
  right: 'Right',
  pagedown: 'PageDown',
  pageup: 'PageUp',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  ',': ',',
  '.': '.',
  '/': '/',
  ';': ';',
  "'": "'",
  '[': '[',
  ']': ']',
  '\\': '\\',
  '-': '-',
  '=': '=',
  '`': '`',
};

export const SHORTCUT_ACTION_ORDER: ShortcutAction[] = [
  'runQuery',
  'saveQuery',
  'sendAIChatMessage',
  'focusSidebarSearch',
  'newQueryTab',
  'toggleLogPanel',
  'toggleTheme',
  'openShortcutManager',
  'toggleMacFullscreen',
];

export const SHORTCUT_ACTION_LABEL_KEYS: Record<ShortcutAction, I18nKey> = {
  runQuery: 'shortcuts.action.runQuery.label',
  saveQuery: 'shortcuts.action.saveQuery.label',
  sendAIChatMessage: 'shortcuts.action.sendAIChatMessage.label',
  focusSidebarSearch: 'shortcuts.action.focusSidebarSearch.label',
  newQueryTab: 'shortcuts.action.newQueryTab.label',
  toggleLogPanel: 'shortcuts.action.toggleLogPanel.label',
  toggleTheme: 'shortcuts.action.toggleTheme.label',
  openShortcutManager: 'shortcuts.action.openShortcutManager.label',
  toggleMacFullscreen: 'shortcuts.action.toggleMacFullscreen.label',
};

export const SHORTCUT_ACTION_DESCRIPTION_KEYS: Record<ShortcutAction, I18nKey> = {
  runQuery: 'shortcuts.action.runQuery.description',
  saveQuery: 'shortcuts.action.saveQuery.description',
  sendAIChatMessage: 'shortcuts.action.sendAIChatMessage.description',
  focusSidebarSearch: 'shortcuts.action.focusSidebarSearch.description',
  newQueryTab: 'shortcuts.action.newQueryTab.description',
  toggleLogPanel: 'shortcuts.action.toggleLogPanel.description',
  toggleTheme: 'shortcuts.action.toggleTheme.description',
  openShortcutManager: 'shortcuts.action.openShortcutManager.description',
  toggleMacFullscreen: 'shortcuts.action.toggleMacFullscreen.description',
};

export const SHORTCUT_ACTION_META: Record<ShortcutAction, ShortcutActionMeta> = {
  runQuery: {},
  saveQuery: {
    allowInEditable: true,
    scope: 'queryEditor',
  },
  sendAIChatMessage: {
    allowInEditable: true,
    allowWithoutModifier: true,
    scope: 'aiComposer',
    requiredKey: 'Enter',
    disallowShift: true,
  },
  focusSidebarSearch: {
    allowInEditable: true,
  },
  newQueryTab: {},
  toggleLogPanel: {},
  toggleTheme: {},
  openShortcutManager: {
    allowInEditable: true,
  },
  toggleMacFullscreen: {
    platformOnly: 'mac',
  },
};

export const DEFAULT_SHORTCUT_OPTIONS: ShortcutOptions = {
  runQuery: { combo: 'Ctrl+Shift+R', enabled: true },
  saveQuery: { combo: 'Ctrl+S', enabled: true },
  sendAIChatMessage: { combo: 'Enter', enabled: true },
  focusSidebarSearch: { combo: 'Ctrl+F', enabled: true },
  newQueryTab: { combo: 'Ctrl+Shift+N', enabled: true },
  toggleLogPanel: { combo: 'Ctrl+Shift+L', enabled: true },
  toggleTheme: { combo: 'Ctrl+Shift+D', enabled: true },
  openShortcutManager: { combo: 'Ctrl+,', enabled: true },
  toggleMacFullscreen: { combo: 'Ctrl+Meta+F', enabled: true },
};

const normalizeKeyToken = (value: string): string => {
  const token = String(value || '').trim();
  if (!token) return '';
  const alias = KEY_ALIASES[token.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1[0-2])$/i.test(token)) {
    return token.toUpperCase();
  }
  if (token.length === 1) {
    return token === '+' ? '+' : token.toUpperCase();
  }
  return token.length > 1 ? token[0].toUpperCase() + token.slice(1).toLowerCase() : token;
};

export const normalizeShortcutCombo = (combo: string): string => {
  const raw = String(combo || '').trim();
  if (!raw) return '';

  const pieces = raw
    .split('+')
    .map(part => part.trim())
    .filter(Boolean);

  const modifiers: string[] = [];
  let key = '';

  pieces.forEach((part) => {
    const normalized = normalizeKeyToken(part);
    if (!normalized) return;
    if (MODIFIER_SET.has(normalized as typeof MODIFIER_ORDER[number])) {
      if (!modifiers.includes(normalized)) {
        modifiers.push(normalized);
      }
      return;
    }
    key = normalized;
  });

  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a as typeof MODIFIER_ORDER[number]) - MODIFIER_ORDER.indexOf(b as typeof MODIFIER_ORDER[number]));
  if (!key) {
    return modifiers.join('+');
  }
  return [...modifiers, key].join('+');
};

const normalizeKeyboardKey = (key: string): string => {
  const token = String(key || '').trim();
  if (!token) return '';
  const alias = KEY_ALIASES[token.toLowerCase()];
  if (alias) return alias;
  if (token.length === 1) {
    if (token === ' ') return 'Space';
    return token.toUpperCase();
  }
  if (/^f([1-9]|1[0-2])$/i.test(token)) {
    return token.toUpperCase();
  }
  return token.length > 1 ? token[0].toUpperCase() + token.slice(1) : token;
};

export const eventToShortcut = (event: KeyboardEvent | ReactKeyboardEvent): string => {
  const key = normalizeKeyboardKey(event.key);
  if (!key || MODIFIER_SET.has(key as typeof MODIFIER_ORDER[number])) {
    return '';
  }

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.metaKey) modifiers.push('Meta');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  return normalizeShortcutCombo([...modifiers, key].join('+'));
};

export const isShortcutMatch = (event: KeyboardEvent | ReactKeyboardEvent, combo: string): boolean => {
  const expected = normalizeShortcutCombo(combo);
  if (!expected) return false;
  const actual = eventToShortcut(event);
  return actual === expected;
};

export const isQuerySaveShortcutMatch = (event: KeyboardEvent | ReactKeyboardEvent, combo: string): boolean => {
  if (isShortcutMatch(event, combo)) {
    return true;
  }

  // Ctrl+S 是默认保存查询快捷键；macOS 用户通常按 Command+S。
  // 仅在用户保留默认绑定时提供 Meta+S 兼容，避免自定义快捷键后额外触发。
  if (normalizeShortcutCombo(combo) !== DEFAULT_SHORTCUT_OPTIONS.saveQuery.combo) {
    return false;
  }

  return event.metaKey === true
    && event.ctrlKey !== true
    && event.altKey !== true
    && event.shiftKey !== true
    && normalizeKeyboardKey(event.key) === 'S';
};

export const hasModifierKey = (combo: string): boolean => {
  const normalized = normalizeShortcutCombo(combo);
  if (!normalized) return false;
  return normalized.split('+').some(part => MODIFIER_SET.has(part as typeof MODIFIER_ORDER[number]));
};

const getShortcutKeyToken = (combo: string): string => {
  const parts = normalizeShortcutCombo(combo).split('+').filter(Boolean);
  const key = parts[parts.length - 1] || '';
  return MODIFIER_SET.has(key as typeof MODIFIER_ORDER[number]) ? '' : key;
};

const getShortcutModifierTokens = (combo: string): string[] => (
  normalizeShortcutCombo(combo)
    .split('+')
    .filter(part => MODIFIER_SET.has(part as typeof MODIFIER_ORDER[number]))
);

export const canRecordShortcutForAction = (action: ShortcutAction, combo: string): boolean => {
  const normalized = normalizeShortcutCombo(combo);
  if (!normalized || !getShortcutKeyToken(normalized)) {
    return false;
  }

  const meta = SHORTCUT_ACTION_META[action];
  if (meta.requiredKey && getShortcutKeyToken(normalized) !== normalizeShortcutCombo(meta.requiredKey)) {
    return false;
  }
  if (meta.disallowShift && normalized.split('+').includes('Shift')) {
    return false;
  }
  if (meta.allowWithoutModifier) {
    return getShortcutModifierTokens(normalized).length <= 1;
  }
  return hasModifierKey(normalized);
};

export const cloneShortcutOptions = (value: ShortcutOptions): ShortcutOptions => {
  return SHORTCUT_ACTION_ORDER.reduce((acc, action) => {
    acc[action] = {
      combo: normalizeShortcutCombo(value[action]?.combo || DEFAULT_SHORTCUT_OPTIONS[action].combo),
      enabled: value[action]?.enabled !== false,
    };
    return acc;
  }, {} as ShortcutOptions);
};

export const sanitizeShortcutOptions = (value: unknown): ShortcutOptions => {
  const raw = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  const defaults = cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS);

  SHORTCUT_ACTION_ORDER.forEach((action) => {
    const actionRaw = raw[action];
    if (!actionRaw || typeof actionRaw !== 'object') {
      return;
    }
    const binding = actionRaw as Record<string, unknown>;
    const combo = normalizeShortcutCombo(String(binding.combo || defaults[action].combo));
    defaults[action] = {
      combo: combo && canRecordShortcutForAction(action, combo) ? combo : defaults[action].combo,
      enabled: binding.enabled === false ? false : true,
    };
  });

  return defaults;
};

export const isEditableElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (target.isContentEditable) {
    return true;
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  if (target.closest('.monaco-editor, .monaco-inputbox, .ant-select, .ant-picker, .ant-input')) {
    return true;
  }
  return false;
};

export const getShortcutDisplay = (combo: string): string => {
  const normalized = normalizeShortcutCombo(combo);
  return normalized || '-';
};
