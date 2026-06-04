const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cacheLinkTargets() {
  const cacheRoots = unique([
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright') : '',
    process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '',
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ]);
  const linksDirs = cacheRoots.map(root => path.join(root, '.links')).filter(fs.existsSync);

  return linksDirs.flatMap(linksDir => fs.readdirSync(linksDir).flatMap(name => {
      try {
        return [fs.readFileSync(path.join(linksDir, name), 'utf8').trim()];
      } catch {
        return [];
      }
    })).sort((left, right) => {
    const priority = value => value.includes('/playwright/driver/package')
      ? 0
      : value.includes('/patchright/driver/package')
        ? 1
        : 2;
    return priority(left) - priority(right);
  });
}

function packageVersion(modulePath) {
  let current = modulePath;
  while (current !== path.dirname(current)) {
    const packageJson = path.join(current, 'package.json');
    if (fs.existsSync(packageJson)) {
      try {
        return JSON.parse(fs.readFileSync(packageJson, 'utf8')).version || '';
      } catch {
        return '';
      }
    }
    current = path.dirname(current);
  }
  return '';
}

function moduleCandidates(rootDir) {
  const rootRequire = createRequire(path.join(rootDir, 'package.json'));
  const candidates = [];

  for (const name of ['playwright', 'playwright-core']) {
    try {
      candidates.push({
        source: `node:${name}`,
        modulePath: rootRequire.resolve(name),
        version: packageVersion(rootRequire.resolve(name)),
        runtime: rootRequire(name),
      });
    } catch {}
  }

  const explicitPaths = unique([
    process.env.LARK_PLAYWRIGHT_MODULE,
    ...cacheLinkTargets(),
  ]);
  for (const modulePath of explicitPaths) {
    try {
      candidates.push({
        source: `path:${modulePath}`,
        modulePath,
        version: packageVersion(modulePath),
        runtime: require(modulePath),
      });
    } catch {}
  }

  return candidates;
}

function inspectRuntimes(rootDir) {
  return moduleCandidates(rootDir).map(candidate => {
    try {
      const executablePath = candidate.runtime.chromium.executablePath();
      return {
        source: candidate.source,
        modulePath: candidate.modulePath,
        version: candidate.version,
        executablePath,
        executableExists: fs.existsSync(executablePath),
      };
    } catch (error) {
      return {
        source: candidate.source,
        modulePath: candidate.modulePath,
        executableExists: false,
        error: error.message,
      };
    }
  });
}

function loadPlaywrightRuntime({ rootDir }) {
  const candidates = moduleCandidates(rootDir);
  for (const candidate of candidates) {
    try {
      const executablePath = candidate.runtime.chromium.executablePath();
      if (!fs.existsSync(executablePath)) continue;
      return {
        chromium: candidate.runtime.chromium,
        executablePath,
        modulePath: candidate.modulePath,
        version: candidate.version,
        source: candidate.source,
      };
    } catch {}
  }

  const inspected = inspectRuntimes(rootDir);
  throw new Error(
    `未找到可用的 Playwright Chromium 运行时。已检查：${JSON.stringify(inspected)}`,
  );
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  try {
    const { chromium: _chromium, ...runtime } = loadPlaywrightRuntime({ rootDir });
    console.log(JSON.stringify(runtime));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  inspectRuntimes,
  loadPlaywrightRuntime,
};
