export const normalizeAiMarkdown = (content: string): string => {
  let text = String(content || '').replace(/\r\n/g, '\n');
  const knownFenceLanguages = [
    'sql', 'mermaid', 'json', 'javascript', 'typescript', 'ts', 'js', 'tsx', 'jsx',
    'bash', 'sh', 'shell', 'python', 'py', 'go', 'java', 'yaml', 'yml', 'html', 'css',
    'xml', 'markdown', 'md', 'text', 'plaintext', 'vue', 'php', 'ruby', 'rust', 'toml',
    'ini', 'diff',
  ];
  const fencePattern = new RegExp(`(^|\\n)\`\`\`(${knownFenceLanguages.join('|')})([^\\n])`, 'gi');
  text = text.replace(fencePattern, '$1```$2\n$3');
  text = text.replace(/([^\n])```(?=\n|$)/g, '$1\n```');
  return text;
};
