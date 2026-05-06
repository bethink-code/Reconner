import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { spawnSync } from "node:child_process";

const TEST_FILE_SUFFIX = ".test.ts";

function collectTestFiles(inputPath) {
  const resolvedPath = resolve(inputPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Test path not found: ${inputPath}`);
  }

  const stats = statSync(resolvedPath);
  if (stats.isFile()) {
    return resolvedPath.endsWith(TEST_FILE_SUFFIX) ? [resolvedPath] : [];
  }

  const testFiles = [];
  for (const entry of readdirSync(resolvedPath, { withFileTypes: true })) {
    const entryPath = resolve(resolvedPath, entry.name);
    if (entry.isDirectory()) {
      testFiles.push(...collectTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === ".ts" && entry.name.endsWith(TEST_FILE_SUFFIX)) {
      testFiles.push(entryPath);
    }
  }

  return testFiles.sort();
}

const requestedPaths = process.argv.slice(2);
const searchRoots = requestedPaths.length > 0 ? requestedPaths : ["tests"];
const testFiles = [...new Set(searchRoots.flatMap(collectTestFiles))];

if (testFiles.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  "--experimental-strip-types",
  "--test",
  "--test-concurrency=1",
  "--test-isolation=none",
  ...testFiles,
], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
