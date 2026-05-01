import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const SOURCE_GLOBS = [
  'frontend/src',
  'frontend/scripts',
  'backend/src/main/java',
  'backend/src/test/java',
  'src-tauri/src',
  'scripts',
];
const EXCLUDES = [
  '.omx/**',
  'node_modules/**',
  'frontend/node_modules/**',
  'frontend/dist/**',
  'backend/target/**',
  'src-tauri/target/**',
  'dist/**',
  '.m2/**',
];
const MAX_TRACKED_SOURCE_LINES = Number(process.env.JAVANAVI_SOURCE_HEALTH_MAX_LINES || 8_000);
const REVIEW_WARN_LINES = Number(process.env.JAVANAVI_SOURCE_HEALTH_WARN_LINES || 3_000);
const LARGE_FILE_BASELINES = new Map([
  ['frontend/src/components/ConnectionModal.tsx', 7_276],
  ['frontend/src/components/DataGrid.tsx', 6_409],
  ['frontend/src/components/Sidebar.tsx', 4_923],
  ['frontend/src/App.tsx', 3_826],
  ['frontend/src/components/TableDesigner.tsx', 3_081],
]);
const LARGE_FILE_GROWTH_ALLOWANCE = Number(process.env.JAVANAVI_SOURCE_HEALTH_BASELINE_ALLOWANCE || 25);

const gitArgs = ['ls-files', ...SOURCE_GLOBS, ...EXCLUDES.flatMap((glob) => [':(exclude)' + glob])];
const files = execFileSync('git', gitArgs, { encoding: 'utf8' })
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const lineCounts = files
  .map((file) => {
    const output = execFileSync('wc', ['-l', file], { encoding: 'utf8' }).trim();
    const count = Number(output.split(/\s+/)[0] || 0);
    return { file, count };
  })
  .sort((left, right) => right.count - left.count);

const oversized = lineCounts.filter((item) => item.count > MAX_TRACKED_SOURCE_LINES);
const baselineRegressions = lineCounts.filter((item) => {
  const baseline = LARGE_FILE_BASELINES.get(item.file);
  return baseline !== undefined && item.count > baseline + LARGE_FILE_GROWTH_ALLOWANCE;
});
if (oversized.length > 0 || baselineRegressions.length > 0) {
  if (oversized.length > 0) {
    console.error(`Source health failed: tracked source file exceeds ${MAX_TRACKED_SOURCE_LINES} lines.`);
    for (const item of oversized) {
      console.error(`${item.count}\t${item.file}`);
    }
  }
  if (baselineRegressions.length > 0) {
    console.error(`Source health failed: large-file baseline grew by more than ${LARGE_FILE_GROWTH_ALLOWANCE} lines.`);
    for (const item of baselineRegressions) {
      const baseline = LARGE_FILE_BASELINES.get(item.file);
      console.error(`${item.count}\t${item.file}\tbaseline=${baseline}`);
    }
  }
  process.exit(1);
}

const warnings = lineCounts.filter((item) => item.count >= REVIEW_WARN_LINES).slice(0, 20);
console.log(`Scanned ${files.length} tracked source files (generated outputs excluded).`);
if (warnings.length > 0) {
  console.log(`Large-file watchlist (>=${REVIEW_WARN_LINES} lines, non-failing):`);
  for (const item of warnings) {
    const baseline = LARGE_FILE_BASELINES.get(item.file);
    const baselineText = baseline === undefined ? '' : `\tbaseline=${baseline}`;
    console.log(`${item.count}\t${item.file}${baselineText}`);
  }
  console.log(`Large-file baseline allowance: +${LARGE_FILE_GROWTH_ALLOWANCE} lines. Extract helpers instead of growing listed files.`);
}

const ignoredGenerated = [
  'frontend/dist',
  'backend/target',
  'src-tauri/target',
  'dist',
].filter((targetPath) => {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
});
if (ignoredGenerated.length > 0) {
  console.log(`Ignored generated directories: ${ignoredGenerated.join(', ')}`);
}
