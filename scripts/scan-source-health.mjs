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
if (oversized.length > 0) {
  console.error(`Source health failed: tracked source file exceeds ${MAX_TRACKED_SOURCE_LINES} lines.`);
  for (const item of oversized) {
    console.error(`${item.count}\t${item.file}`);
  }
  process.exit(1);
}

const warnings = lineCounts.filter((item) => item.count >= REVIEW_WARN_LINES).slice(0, 20);
console.log(`Scanned ${files.length} tracked source files (generated outputs excluded).`);
if (warnings.length > 0) {
  console.log(`Large-file watchlist (>=${REVIEW_WARN_LINES} lines, non-failing):`);
  for (const item of warnings) {
    console.log(`${item.count}\t${item.file}`);
  }
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
