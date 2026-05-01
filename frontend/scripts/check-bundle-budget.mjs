import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const distAssets = path.resolve(import.meta.dirname, '../dist/assets');
const defaultWarnKb = 512;
const defaultFailKb = 4_096;
const warnKb = Number(process.env.JAVANAVI_BUNDLE_WARN_KB || defaultWarnKb);
const failKb = Number(process.env.JAVANAVI_BUNDLE_FAIL_KB || defaultFailKb);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const jsAssets = walk(distAssets)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, sizeKb: statSync(file).size / 1024 }))
  .sort((left, right) => right.sizeKb - left.sizeKb);

const failing = jsAssets.filter((asset) => asset.sizeKb > failKb);
const warning = jsAssets.filter((asset) => asset.sizeKb > warnKb).slice(0, 20);
if (warning.length > 0) {
  console.log(`Bundle budget watchlist (> ${warnKb} KiB):`);
  for (const asset of warning) {
    console.log(`${asset.sizeKb.toFixed(1)} KiB\t${path.relative(path.resolve(import.meta.dirname, '..'), asset.file)}`);
  }
}
if (failing.length > 0) {
  console.error(`Bundle budget failed: JS asset exceeds ${failKb} KiB.`);
  process.exit(1);
}
console.log(`Bundle budget passed: ${jsAssets.length} JS assets, max ${jsAssets[0]?.sizeKb.toFixed(1) || '0.0'} KiB.`);
