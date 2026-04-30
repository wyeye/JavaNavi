export interface CustomConnectionDsnState {
  dsnInput: unknown;
  hasStoredSecret?: boolean;
  clearStoredSecret?: boolean;
}

export const getCustomConnectionDsnValidationMessage = ({
  dsnInput,
  hasStoredSecret,
  clearStoredSecret,
}: CustomConnectionDsnState): string | null => {
  const dsnText = String(dsnInput ?? '').trim();
  if (dsnText !== '') {
    return null;
  }
  if (hasStoredSecret && !clearStoredSecret) {
    return null;
  }
  if (hasStoredSecret && clearStoredSecret) {
    return '请输入新的连接字符串，或取消清除已保存 DSN';
  }
  return '请输入连接字符串';
};

export const shouldAllowBlankCustomDsn = (state: CustomConnectionDsnState): boolean => (
  getCustomConnectionDsnValidationMessage(state) === null
);
