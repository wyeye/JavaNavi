import { spawnSync } from 'node:child_process';
import path from 'node:path';

const requiredMajor = Number(process.argv[2] || 17);

if (!Number.isInteger(requiredMajor) || requiredMajor <= 0) {
  console.error('Usage: node scripts/check-java-version.mjs <required-major-version>');
  process.exit(2);
}

const javaExecutableName = process.platform === 'win32' ? 'java.exe' : 'java';
const javaCommand = process.env.JAVANAVI_JAVA_COMMAND
  || (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', javaExecutableName) : javaExecutableName);

const result = spawnSync(javaCommand, ['-version'], { encoding: 'utf8' });
const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();

if (result.error) {
  console.error(`Java ${requiredMajor}+ is required, but Java could not be executed: ${result.error.message}`);
  console.error(`Checked command: ${javaCommand}`);
  console.error('Set JAVA_HOME to a Java 17+ JDK before running backend Maven tasks.');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Java ${requiredMajor}+ is required, but "java -version" exited with code ${result.status}.`);
  if (output) console.error(output);
  process.exit(1);
}

const versionText = extractVersion(output);
const currentMajor = versionText ? majorVersion(versionText) : 0;

if (currentMajor < requiredMajor) {
  console.error(`Java ${requiredMajor}+ is required for JavaNavi backend Maven tasks.`);
  console.error(`Current Java: ${versionText || 'unknown'}${currentMajor ? ` (major ${currentMajor})` : ''}`);
  console.error(`Checked command: ${javaCommand}`);
  console.error('Set JAVA_HOME to a Java 17+ JDK and rerun the command.');
  process.exit(1);
}

console.log(`Java version check passed: ${versionText} (major ${currentMajor}).`);

function extractVersion(text) {
  const quoted = text.match(/\bversion\s+"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];

  const unquoted = text.match(/\b(?:openjdk|java)\s+([0-9]+(?:\.[0-9]+){0,3}(?:[_+-][0-9A-Za-z.-]+)?)/i);
  return unquoted?.[1] || '';
}

function majorVersion(versionText) {
  const parts = String(versionText || '').match(/\d+/g)?.map(Number) || [];
  if (parts.length === 0) return 0;
  if (parts[0] === 1 && parts.length > 1) return parts[1];
  return parts[0];
}
