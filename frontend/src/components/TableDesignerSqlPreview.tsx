import { useCallback, useEffect, useMemo, useRef } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useStore } from '../store';
import { translate, type I18nKey, type I18nParams } from '../i18n';

interface TableDesignerSqlPreviewProps {
  sql: string;
  darkMode?: boolean;
  height?: string | number;
}

export type SqlChangeHighlightKind =
  | 'add'
  | 'comment'
  | 'constraint'
  | 'create'
  | 'drop'
  | 'modify'
  | 'rename';

export interface SqlChangeHighlight {
  line: string;
  lineNumber: number;
  kind: SqlChangeHighlightKind;
  label: string;
}

const SQL_PREVIEW_LIGHT_THEME = 'javanavi-sql-preview-light';
const SQL_PREVIEW_DARK_THEME = 'javanavi-sql-preview-dark';

const CHANGE_LINE_RULES: Array<{
  kind: SqlChangeHighlightKind;
  pattern: RegExp;
}> = [
  { kind: 'rename', pattern: /\b(RENAME\s+COLUMN|CHANGE\s+COLUMN|RENAME\s+TO|SP_RENAME)\b/i },
  { kind: 'add', pattern: /\b(ADD\s+COLUMN|ADD\s+PRIMARY\s+KEY)\b/i },
  { kind: 'drop', pattern: /\b(DROP\s+COLUMN|DROP\s+PRIMARY\s+KEY)\b/i },
  { kind: 'modify', pattern: /\b(MODIFY\s+COLUMN|ALTER\s+COLUMN|SET\s+DATA\s+TYPE|SET\s+DEFAULT|DROP\s+DEFAULT|SET\s+NOT\s+NULL|DROP\s+NOT\s+NULL)\b/i },
  { kind: 'constraint', pattern: /\b(ADD\s+CONSTRAINT|DROP\s+CONSTRAINT)\b/i },
  { kind: 'comment', pattern: /\b(COMMENT\s+ON\s+COLUMN|COMMENT\s+ON\s+TABLE)\b/i },
];

const SQL_CHANGE_LABEL_KEYS: Record<SqlChangeHighlightKind, I18nKey> = {
  rename: 'designer.sqlPreview.rename',
  add: 'designer.sqlPreview.add',
  drop: 'designer.sqlPreview.drop',
  modify: 'designer.sqlPreview.modify',
  constraint: 'designer.sqlPreview.constraint',
  comment: 'designer.sqlPreview.comment',
  create: 'designer.sqlPreview.createTable',
};

const CREATE_TABLE_PATTERN = /^\s*CREATE\s+TABLE\b/i;

const getCreateTableLineHighlight = (line: string, lineNumber: number, label: string): SqlChangeHighlight | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('--')) return null;
  return {
    line,
    lineNumber,
    kind: 'create',
    label,
  };
};

const getAlterLineHighlight = (line: string, lineNumber: number, resolveLabel: (kind: SqlChangeHighlightKind) => string): SqlChangeHighlight | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('--')) return null;

  const matchedRule = CHANGE_LINE_RULES.find((rule) => rule.pattern.test(trimmed));
  if (!matchedRule) return null;

  return {
    line,
    lineNumber,
    kind: matchedRule.kind,
    label: resolveLabel(matchedRule.kind),
  };
};

export const resolveSqlChangeHighlights = (
  sql: string,
  resolveLabel: (kind: SqlChangeHighlightKind) => string,
): SqlChangeHighlight[] => {
  const lines = sql.split(/\r?\n/);
  const isCreateTableSql = lines.some((line) => CREATE_TABLE_PATTERN.test(line));

  return lines
    .map((line, index) => (
      isCreateTableSql
        ? getCreateTableLineHighlight(line, index + 1, resolveLabel('create'))
        : getAlterLineHighlight(line, index + 1, resolveLabel)
    ))
    .filter((highlight): highlight is SqlChangeHighlight => Boolean(highlight));
};

const registerSqlPreviewThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(SQL_PREVIEW_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '006C9C', fontStyle: 'bold' },
      { token: 'operator', foreground: '8250DF' },
      { token: 'number', foreground: 'B45309' },
      { token: 'string', foreground: '15803D' },
      { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
      { token: 'predefined', foreground: '0F766E' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#0F172A0A',
      'editorGutter.background': '#00000000',
      'editorLineNumber.foreground': '#94A3B8',
    },
  });

  monaco.editor.defineTheme(SQL_PREVIEW_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7DD3FC', fontStyle: 'bold' },
      { token: 'operator', foreground: 'C4B5FD' },
      { token: 'number', foreground: 'FDBA74' },
      { token: 'string', foreground: '86EFAC' },
      { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
      { token: 'predefined', foreground: '5EEAD4' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#FFFFFF12',
      'editorGutter.background': '#00000000',
      'editorLineNumber.foreground': '#64748B',
    },
  });
};

const getLineDecorationClassName = (kind: SqlChangeHighlightKind): string =>
  `javanavi-sql-preview-change-line javanavi-sql-preview-change-line-${kind}`;

const getLineDecorationMarkerClassName = (kind: SqlChangeHighlightKind): string =>
  `javanavi-sql-preview-change-marker javanavi-sql-preview-change-marker-${kind}`;

const TableDesignerSqlPreview: React.FC<TableDesignerSqlPreviewProps> = ({
  sql,
  darkMode = false,
  height = '360px',
}) => {
  const language = useStore((state) => state.language);
  const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
  const resolveLabel = useCallback((kind: SqlChangeHighlightKind) => t(SQL_CHANGE_LABEL_KEYS[kind]), [t]);
  const decorationIdsRef = useRef<string[]>([]);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const changeHighlights = useMemo(() => resolveSqlChangeHighlights(sql, resolveLabel), [resolveLabel, sql]);

  const applyChangeDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel?.();
    if (!editor || !monaco || !model) return;

    const lineCount = model.getLineCount();
    const decorations = changeHighlights
      .filter((highlight) => highlight.lineNumber <= lineCount)
      .map((highlight) => {
        const endColumn = Math.max(1, model.getLineMaxColumn(highlight.lineNumber));
        return {
          range: new monaco.Range(highlight.lineNumber, 1, highlight.lineNumber, endColumn),
          options: {
            className: getLineDecorationClassName(highlight.kind),
            hoverMessage: { value: highlight.label },
            isWholeLine: true,
            linesDecorationsClassName: getLineDecorationMarkerClassName(highlight.kind),
          },
        };
      });

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [changeHighlights]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyChangeDecorations();
  };

  useEffect(() => {
    applyChangeDecorations();
  }, [applyChangeDecorations, sql]);

  return (
    <div
      data-table-designer-sql-preview="true"
      style={{
        maxHeight: 400,
        overflow: 'hidden',
        borderRadius: 8,
        border: darkMode ? '1px solid #333' : '1px solid #eee',
      }}
    >
      <style>
        {`
.javanavi-sql-preview-change-line {
  border-left: 3px solid transparent;
}
.javanavi-sql-preview-change-line-add,
.javanavi-sql-preview-change-line-create {
  background: rgba(22, 163, 74, 0.14);
  border-left-color: #16a34a;
}
.javanavi-sql-preview-change-line-drop {
  background: rgba(220, 38, 38, 0.14);
  border-left-color: #dc2626;
}
.javanavi-sql-preview-change-line-modify,
.javanavi-sql-preview-change-line-rename,
.javanavi-sql-preview-change-line-constraint,
.javanavi-sql-preview-change-line-comment {
  background: rgba(217, 119, 6, 0.16);
  border-left-color: #d97706;
}
.javanavi-sql-preview-change-marker {
  width: 4px !important;
  margin-left: 2px;
  border-radius: 999px;
}
.javanavi-sql-preview-change-marker-add,
.javanavi-sql-preview-change-marker-create {
  background: #16a34a;
}
.javanavi-sql-preview-change-marker-drop {
  background: #dc2626;
}
.javanavi-sql-preview-change-marker-modify,
.javanavi-sql-preview-change-marker-rename,
.javanavi-sql-preview-change-marker-constraint,
.javanavi-sql-preview-change-marker-comment {
  background: #d97706;
}
        `}
      </style>
      <Editor
        beforeMount={registerSqlPreviewThemes}
        defaultLanguage="sql"
        height={height}
        language="sql"
        onMount={handleEditorMount}
        options={{
          automaticLayout: true,
          fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
          fontSize: 13,
          lineNumbers: 'on',
          lineDecorationsWidth: 14,
          minimap: { enabled: false },
          padding: { top: 8, bottom: 8 },
          readOnly: true,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
        theme={darkMode ? SQL_PREVIEW_DARK_THEME : SQL_PREVIEW_LIGHT_THEME}
        value={sql}
      />
    </div>
  );
};

export default TableDesignerSqlPreview;
