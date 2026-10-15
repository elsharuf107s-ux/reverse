import express from 'express';
import multer from 'multer';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';

const execFileAsync = promisify(execFile);
const app = express();
const ROOT = process.cwd();
const TARGETS = path.join(ROOT, 'targets');
const OUTPUTS = path.join(ROOT, 'analysis-output');
const REA = path.join(ROOT, 'node_modules', '.bin', 'rea');
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_GB = Number(process.env.MAX_UPLOAD_GB || 8);
const MAX_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_GB * 1024 * 1024 * 1024);
const env = {
  ...process.env,
  GHIDRA_INSTALL_DIR: process.env.GHIDRA_INSTALL_DIR || '/opt/ghidra_12.1.4_PUBLIC',
  JAVA_HOME: process.env.JAVA_HOME || '/usr/lib/jvm/java-21-openjdk-amd64',
  REA_ANALYSIS_PROVIDER: process.env.REA_ANALYSIS_PROVIDER || 'ghidra'
};

await fs.mkdir(TARGETS, { recursive: true });
await fs.mkdir(OUTPUTS, { recursive: true });

function safeName(value = '') {
  return path.basename(String(value)).replace(/[^a-zA-Z0-9._+ -]/g, '_').slice(0, 180) || 'target.bin';
}

function targetPath(name) {
  const candidate = path.resolve(TARGETS, String(name || ''));
  if (candidate !== TARGETS && !candidate.startsWith(`${TARGETS}${path.sep}`)) {
    throw new Error('Invalid target path.');
  }
  return candidate;
}

function compact(text, limit = 2_000_000) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}\n\n[preview truncated — full result saved on disk]` : text;
}

async function runSmall(args, timeout = 60_000) {
  try {
    const { stdout, stderr } = await execFileAsync(REA, args, {
      cwd: ROOT,
      env,
      timeout,
      maxBuffer: 8 * 1024 * 1024
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      code: error.code ?? null
    };
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TARGETS),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/status', async (_req, res) => {
  const [doctor, providers, version, java] = await Promise.all([
    runSmall(['doctor', '--provider', 'ghidra', '--json'], 90_000),
    runSmall(['providers', '--json'], 30_000),
    runSmall(['--version'], 15_000),
    execFileAsync('java', ['-version'], { env, timeout: 15_000 }).then(({ stderr }) => ({ ok: true, stderr })).catch(error => ({ ok: false, stderr: error.message }))
  ]);
  res.json({
    rea: version,
    doctor,
    providers,
    java,
    ghidraInstallDir: env.GHIDRA_INSTALL_DIR,
    javaHome: env.JAVA_HOME,
    defaultProvider: env.REA_ANALYSIS_PROVIDER,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    maxUploadGB: MAX_UPLOAD_GB
  });
});

app.get('/api/targets', async (_req, res) => {
  const entries = await fs.readdir(TARGETS, { withFileTypes: true });
  const targets = await Promise.all(entries
    .filter(entry => entry.name !== '.gitkeep')
    .map(async entry => {
      const full = path.join(TARGETS, entry.name);
      const stat = await fs.stat(full);
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime.toISOString()
      };
    }));
  targets.sort((a, b) => b.modified.localeCompare(a.modified));
  res.json({ targets });
});

app.post('/api/upload', (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (error) return next(error);
    if (!req.file) return res.status(400).json({ error: 'Choose a file first.' });
    res.json({ name: req.file.filename, size: req.file.size, originalName: req.file.originalname });
  });
});

app.get('/api/output/:name', async (req, res) => {
  const name = safeName(req.params.name);
  const full = path.join(OUTPUTS, name);
  try {
    await fs.access(full);
    res.download(full, name);
  } catch {
    res.status(404).json({ error: 'Output not found.' });
  }
});

app.post('/api/analyze', async (req, res) => {
  const { target, operation = 'analyze', query = '' } = req.body || {};
  const allowed = new Set(['analyze', 'inspect', 'search', 'function', 'decompile', 'instructions', 'xrefs', 'trace', 'javascript']);
  if (!allowed.has(operation)) return res.status(400).json({ error: 'Unsupported operation.' });

  let fullTarget;
  try {
    fullTarget = targetPath(target);
    await fs.access(fullTarget);
  } catch {
    return res.status(400).json({ error: 'Select a valid target from the targets folder.' });
  }

  const needsQuery = new Set(['search', 'function', 'decompile', 'instructions', 'xrefs', 'trace']);
  if (needsQuery.has(operation) && !String(query).trim()) {
    return res.status(400).json({ error: `${operation} requires a search term, function name, or address.` });
  }

  let args;
  if (operation === 'javascript') {
    args = ['analyze-javascript-application', fullTarget, '--json'];
  } else if (operation === 'analyze' || operation === 'inspect') {
    args = [operation, fullTarget, '--provider', 'ghidra', '--json'];
  } else {
    args = [operation, fullTarget, String(query).trim(), '--provider', 'ghidra', '--json'];
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outName = `${stamp}-${safeName(target)}-${operation}.json`;
  const outPath = path.join(OUTPUTS, outName);
  const out = createWriteStream(outPath, { flags: 'w' });
  let preview = '';
  let stderr = '';

  const child = spawn(REA, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => {
    out.write(chunk);
    if (preview.length < 2_000_000) preview += chunk.toString('utf8');
  });
  child.stderr.on('data', chunk => {
    if (stderr.length < 500_000) stderr += chunk.toString('utf8');
  });

  child.on('error', async error => {
    out.end();
    await fs.rm(outPath, { force: true }).catch(() => {});
    if (!res.headersSent) res.status(500).json({ error: error.message });
  });

  child.on('close', code => {
    out.end();
    if (res.headersSent) return;
    res.status(code === 0 ? 200 : 500).json({
      ok: code === 0,
      code,
      command: ['rea', ...args].join(' '),
      outputFile: outName,
      preview: compact(preview),
      stderr: compact(stderr, 500_000)
    });
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File is too large for the Workbench upload limit (${MAX_UPLOAD_GB} GB). Put the file in targets/ from the Codespace file explorer/terminal, or raise MAX_UPLOAD_GB.`
      });
    }
    return res.status(400).json({ error: `Upload failed: ${error.message}`, code: error.code });
  }
  res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`REA Workbench listening on http://0.0.0.0:${PORT}`);
  console.log(`Upload limit: ${MAX_UPLOAD_GB} GB`);
});
