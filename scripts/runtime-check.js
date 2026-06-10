const MIN_NODE_VERSION = [22, 5, 0];
const TESTED_NODE_MAJOR = 22;

export function parseNodeVersion(version) {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

export function compareNodeVersions(left, right) {
  const a = Array.isArray(left) ? left : parseNodeVersion(left);
  const b = Array.isArray(right) ? right : parseNodeVersion(right);
  if (!a || !b) return Number.NaN;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function runtimeCompatibilityReport({
  nodeVersion = process.versions.node,
  sqliteVersion = process.versions.sqlite
} = {}) {
  const issues = [];
  const warnings = [];
  const parsed = parseNodeVersion(nodeVersion);

  if (!parsed) {
    issues.push(`Cannot parse Node.js version: ${nodeVersion || '(empty)'}.`);
  } else if (compareNodeVersions(parsed, MIN_NODE_VERSION) < 0) {
    issues.push(`Node.js ${MIN_NODE_VERSION.join('.')} or newer is required; current version is ${nodeVersion}.`);
  }

  if (parsed && parsed[0] !== TESTED_NODE_MAJOR) {
    warnings.push(
      `This project is continuously tested on Node.js ${TESTED_NODE_MAJOR}.x; current version is ${nodeVersion}. Run npm test before promoting a new runtime.`
    );
  }

  if (!sqliteVersion) {
    warnings.push('process.versions.sqlite is not reported; node:sqlite availability will be checked before startup continues.');
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    minimumNodeVersion: MIN_NODE_VERSION.join('.'),
    testedNodeMajor: TESTED_NODE_MAJOR,
    nodeVersion,
    sqliteVersion: sqliteVersion || null
  };
}

export async function assertRuntimeCompatibility({
  importer = () => import('node:sqlite'),
  logger = console,
  ...options
} = {}) {
  const report = runtimeCompatibilityReport(options);
  const issues = [...report.issues];

  try {
    await importer();
  } catch (err) {
    const detail = err?.code || err?.message || String(err);
    issues.push(`node:sqlite is unavailable (${detail}). Start with a Node runtime that exposes node:sqlite; npm start already passes the required flag for Node 22.`);
  }

  for (const warning of report.warnings) {
    logger?.warn?.(`[runtime] ${warning}`);
  }

  if (issues.length) {
    throw new Error(`Unsupported Node.js runtime:\n- ${issues.join('\n- ')}`);
  }

  return { ...report, ok: true, issues: [] };
}
