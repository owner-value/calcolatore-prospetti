require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const child_process = require('child_process');

const prisma = new PrismaClient();
const app = express();
const storageDir = path.join(__dirname, 'storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
const upload = multer({ dest: storageDir });
const auditLogPath = path.join(storageDir, 'audit-log.jsonl');

const appendAuditEntry = (event = {}) => {
  const payload = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  try {
    fs.appendFileSync(auditLogPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (err) {
    console.warn('Unable to write audit log entry', err);
  }
};

const extractClientIp = (req) => {
  const header = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  if (Array.isArray(header)) return header[0] || '';
  if (typeof header === 'string' && header.includes(',')) return header.split(',')[0].trim();
  return header?.toString().trim() || req.socket?.remoteAddress || '';
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/files', express.static(storageDir));

// Debug: log each incoming request path
app.use((req, res, next) => {
  try { console.log('INCOMING', req.method, req.path); } catch(e){}
  next();
});

// Load links config (unique links for projects)
let PROJECT_LINKS = {};
try{
  const linksPath = path.join(__dirname, 'config', 'links.json');
  if (fs.existsSync(linksPath)) {
    PROJECT_LINKS = JSON.parse(fs.readFileSync(linksPath, 'utf8')) || {};
  }
}catch(e){ console.warn('Unable to load links config', e); }

// Version endpoint: commit SHA (if available) and runtime info
let COMMIT_SHA = null;
try{
  // prefer commit.json produced at build time
  const commitPath = path.join(__dirname, 'config', 'commit.json');
  if (fs.existsSync(commitPath)){
    const cj = JSON.parse(fs.readFileSync(commitPath, 'utf8') || '{}');
    COMMIT_SHA = cj.commit || null;
  }
}catch(e){ /* ignore */ }
if (!COMMIT_SHA) {
  COMMIT_SHA = process.env.COMMIT_SHA || null;
}
if (!COMMIT_SHA) {
  try {
    // try to get git short sha from repo root as fallback
    COMMIT_SHA = child_process.execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    COMMIT_SHA = null;
  }
}

app.get('/_version', (req, res) => {
  res.json({ commit: COMMIT_SHA, node: process.version });
});

app.get('/_links', (req, res) => {
  // returns configured project links; useful to get shareable unique URLs
  res.json(PROJECT_LINKS || {});
});

// Short redirect route: /r/:key -> configured link (render/project_page/github)
app.get('/r/:key', (req, res) => {
  const key = req.params.key;
  const info = PROJECT_LINKS[key];
  if (!info) return res.status(404).json({ error: 'Not found' });
  // prefer render, then project_page, then github
  const target = info.render || info.project_page || info.github;
  if (!target) return res.status(404).json({ error: 'No URL configured for this key' });
  // allow optional query param 't' to select a different target (github|render|project_page)
  const t = (req.query.t || '').toString();
  if (t && info[t]) return res.redirect(302, info[t]);
  return res.redirect(302, target);
});

// Admin API: add or update a link entry
app.post('/_links', async (req, res) => {
  try {
    const body = req.body || {};
    const key = (body.key || '').toString().trim();
    if (!key) return res.status(400).json({ error: 'Missing key' });
    const entry = {
      render: body.render || '',
      github: body.github || '',
      project_page: body.project_page || '',
      notes: body.notes || '',
    };

    const linksPath = path.join(__dirname, 'config', 'links.json');
    let links = {};
    try { links = fs.existsSync(linksPath) ? JSON.parse(fs.readFileSync(linksPath, 'utf8') || '{}') : {}; } catch(e) { links = {}; }
    links[key] = entry;
    fs.writeFileSync(linksPath, JSON.stringify(links, null, 2));
    // refresh in-memory
    PROJECT_LINKS = links;
    res.json({ ok: true, key, entry });
  } catch (err) {
    console.error('Failed to write links.json', err);
    res.status(500).json({ error: 'Unable to save' });
  }
});

// Tiny admin page to add links without editing files
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Health check (useful for Render and uptime probes)
app.get('/_health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/audit/logs', (req, res) => {
  try {
    if (!fs.existsSync(auditLogPath)) {
      return res.json([]);
    }
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitRaw) ? 200 : Math.min(Math.max(limitRaw, 1), 500);
    const contents = fs.readFileSync(auditLogPath, 'utf8');
    const lines = contents.split('\n').filter(Boolean);
    const slice = lines.slice(-limit).map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return { raw: line, parseError: true };
      }
    });
    res.json(slice);
  } catch (err) {
    console.error('Unable to read audit log', err);
    res.status(500).json({ error: 'Unable to read audit log' });
  }
});

const slugify = (str = '') =>
  str
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

app.get('/api/prospetti', async (req, res) => {
  const propertySlug = (req.query.property || '').toString().trim();
  const where = propertySlug ? { property: { slug: propertySlug } } : {};
  const items = await prisma.prospect.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { property: true },
  });
  res.json(items);
});

app.get('/api/prospetti/:slug', async (req, res) => {
  const prospect = await prisma.prospect.findUnique({
    where: { slug: req.params.slug },
    include: { property: true },
  });
  if (!prospect) return res.status(404).json({ error: 'Not found' });
  res.json(prospect);
});

app.get('/api/prospetti/:slug/pdf', async (req, res) => {
  const prospect = await prisma.prospect.findUnique({
    where: { slug: req.params.slug },
  });
  if (!prospect) return res.status(404).json({ error: 'Not found' });
  if (!prospect.pdfPath) return res.status(404).json({ error: 'No PDF saved' });

  const filePath = path.join(storageDir, prospect.pdfPath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

  res.sendFile(filePath);
});

app.post('/api/prospetti', upload.single('pdf'), async (req, res) => {
  try {
    const { metadata } = req.body;
    if (!metadata) return res.status(400).json({ error: 'Missing metadata' });
    // Debug: log incoming cedolare if present to help trace client/server mismatch
    try{
      const tmp = JSON.parse(metadata);
      const cedVal = tmp?.formState?.fields?.percentualeCedolare ?? tmp?.percentualeCedolare ?? null;
      console.log('POST /api/prospetti incoming percentualeCedolare =', cedVal);
    }catch(e){ console.warn('Unable to parse metadata for debug logging', e); }
    const data = JSON.parse(metadata);
    const indirizzo1 = (data.indirizzoRiga1 || '').trim();
    const slug = slugify(data.slug || indirizzo1);
    if (!slug) return res.status(400).json({ error: 'Missing indirizzo/slug' });

    let pdfPath = '';
    if (req.file) {
      const ext = path.extname(req.file.originalname || '.pdf') || '.pdf';
      const targetName = `${slug}-${Date.now()}${ext}`;
      const targetPath = path.join(storageDir, targetName);
      fs.renameSync(req.file.path, targetPath);
      pdfPath = targetName;
    }

    let propertyRecord = null;
    const propertySlug = (data.propertySlug || '').toString().trim();
    if (propertySlug) {
      propertyRecord = await prisma.property.findUnique({ where: { slug: propertySlug } });
      if (!propertyRecord) {
        return res.status(400).json({ error: 'Property not found' });
      }
    }

    if (propertySlug && slug === propertySlug) {
      return res.status(400).json({ error: 'Lo slug del prospetto non può coincidere con lo slug della proprietà selezionata' });
    }

    const conflictingProperty = await prisma.property.findUnique({ where: { slug } });
    if (conflictingProperty) {
      return res.status(400).json({ error: 'Slug già utilizzato da una proprietà. Scegli uno slug diverso per il prospetto' });
    }

    const existingProspect = await prisma.prospect.findUnique({ where: { slug } });

    const baseData = {
      titolo: data.titolo || indirizzo1 || slug,
      indirizzo1,
      indirizzo2: (data.indirizzoRiga2 || '').trim(),
      datiJson: data,
    };

    const updateData = {
      ...baseData,
      ...(propertyRecord ? { property: { connect: { id: propertyRecord.id } } } : { property: { disconnect: true } }),
    };

    const createData = {
      slug,
      pdfPath: pdfPath || '',
      ...baseData,
      ...(propertyRecord ? { property: { connect: { id: propertyRecord.id } } } : {}),
    };

    if (pdfPath) {
      updateData.pdfPath = pdfPath;
    }

    const saved = await prisma.prospect.upsert({
      where: { slug },
      update: updateData,
      create: createData,
      include: { property: true },
    });

    appendAuditEntry({
      action: 'prospect.upsert',
      slug,
      mode: existingProspect ? 'update' : 'create',
      propertySlug: saved?.property?.slug || '',
      requestMethod: req.method,
      requestPath: req.originalUrl,
      ip: extractClientIp(req),
      userAgent: (req.headers['user-agent'] || '').toString(),
    });

    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/prospetti/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const prospect = await prisma.prospect.findUnique({ where: { slug }, include: { property: true } });
    if (!prospect) return res.status(404).json({ error: 'Not found' });

    if (prospect.pdfPath) {
      const filePath = path.join(storageDir, prospect.pdfPath);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { console.warn('Unable to delete file', err); }
      }
    }

    appendAuditEntry({
      action: 'prospect.delete',
      slug,
  propertySlug: prospect?.property?.slug || '',
      requestMethod: req.method,
      requestPath: req.originalUrl,
      ip: extractClientIp(req),
      userAgent: (req.headers['user-agent'] || '').toString(),
    });

    await prisma.prospect.delete({ where: { slug } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/prospetti/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    const prospect = await prisma.prospect.findUnique({ where: { slug } });
    if (!prospect) return res.status(404).json({ error: 'Not found' });

    const propertySlug = (req.body?.propertySlug || '').toString().trim();
    let propertyRecord = null;
    if (propertySlug) {
      propertyRecord = await prisma.property.findUnique({ where: { slug: propertySlug } });
      if (!propertyRecord) return res.status(400).json({ error: 'Property not found' });
      if (propertySlug === slug) {
        return res.status(400).json({ error: 'Lo slug del prospetto non può coincidere con lo slug della proprietà selezionata' });
      }
    }

    let datiJson = prospect.datiJson;
    if (datiJson && typeof datiJson === 'object' && !Array.isArray(datiJson)) {
      datiJson.propertySlug = propertySlug;
      datiJson.propertyName = propertyRecord?.nome || '';
      if (datiJson.formState && typeof datiJson.formState === 'object') {
        datiJson.formState.propertySlug = propertySlug;
      }
    }

    const updatePayload = {
      ...(datiJson ? { datiJson } : {}),
      ...(propertyRecord
        ? { property: { connect: { id: propertyRecord.id } } }
        : { property: { disconnect: true } }),
    };

    const updated = await prisma.prospect.update({
      where: { slug },
      data: updatePayload,
      include: { property: true },
    });

    appendAuditEntry({
      action: 'prospect.patch',
      slug,
      propertySlug: updated?.property?.slug || '',
      requestMethod: req.method,
      requestPath: req.originalUrl,
      ip: extractClientIp(req),
      userAgent: (req.headers['user-agent'] || '').toString(),
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/properties', async (req, res) => {
  const items = await prisma.property.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { prospects: true } } },
  });
  res.json(items);
});

app.get('/api/properties/:slug', async (req, res) => {
  const property = await prisma.property.findUnique({
    where: { slug: req.params.slug },
    include: {
      prospects: {
        orderBy: { updatedAt: 'desc' },
        include: { property: true },
      },
    },
  });
  if (!property) return res.status(404).json({ error: 'Not found' });
  res.json(property);
});

app.post('/api/properties', async (req, res) => {
  try {
    const body = req.body || {};
    const rawSlug = body.slug || body.nome || '';
    const slug = slugify(rawSlug);
    if (!slug) return res.status(400).json({ error: 'Missing slug or nome' });

    const payload = {
      slug,
      nome: body.nome?.toString().trim() || slug,
      indirizzo: body.indirizzo?.toString().trim() || '',
      citta: body.citta?.toString().trim() || '',
      ownerNome: body.ownerNome?.toString().trim() || '',
      ownerEmail: body.ownerEmail?.toString().trim() || '',
      ownerTelefono: body.ownerTelefono?.toString().trim() || '',
      note: body.note?.toString().trim() || '',
    };

    const conflictingProspect = await prisma.prospect.findUnique({ where: { slug } });
    if (conflictingProspect) {
      return res.status(400).json({ error: 'Slug già utilizzato da un prospetto. Scegli uno slug diverso per la proprietà' });
    }

    const existingProperty = await prisma.property.findUnique({ where: { slug } });

    const saved = await prisma.property.upsert({
      where: { slug },
      update: {
        nome: payload.nome,
        indirizzo: payload.indirizzo,
        citta: payload.citta,
        ownerNome: payload.ownerNome,
        ownerEmail: payload.ownerEmail,
        ownerTelefono: payload.ownerTelefono,
        note: payload.note,
      },
      create: payload,
    });

    appendAuditEntry({
      action: 'property.upsert',
      slug,
      mode: existingProperty ? 'update' : 'create',
      requestMethod: req.method,
      requestPath: req.originalUrl,
      ip: extractClientIp(req),
      userAgent: (req.headers['user-agent'] || '').toString(),
    });

    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/properties/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    const property = await prisma.property.findUnique({
      where: { slug },
      include: { prospects: true },
    });
    if (!property) return res.status(404).json({ error: 'Not found' });
    if (property.prospects.length > 0) {
      return res.status(400).json({ error: 'Property has prospects and cannot be deleted' });
    }

    appendAuditEntry({
      action: 'property.delete',
      slug,
      requestMethod: req.method,
      requestPath: req.originalUrl,
      ip: extractClientIp(req),
      userAgent: (req.headers['user-agent'] || '').toString(),
    });

    await prisma.property.delete({ where: { slug } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;

// Better startup sequence with Prisma connection and helpful logs for Render
async function start() {
  try {
    console.log(`Starting API (pid=${process.pid})`);
    console.log('PORT:', PORT);
    console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
    await prisma.$connect();
    console.log('Prisma connected successfully');

    // Debug: inspect app object and registered router
    try{
      console.log('app keys:', Object.keys(app).slice(0,80));
      console.log('typeof app.get:', typeof app.get);
      console.log('typeof app.use:', typeof app.use);
      const router = app._router || app.router || null;
      console.log('app._router exists:', !!app._router);
      console.log('app.router exists:', !!app.router);
      const stack = (router && router.stack) || [];
      console.log('router.stack length:', stack.length);
      const stackSummary = stack.map((mw, idx) => {
        return {
          idx,
          name: mw.name || '<anonymous>',
          route: mw.route ? { path: mw.route.path, methods: Object.keys(mw.route.methods || {}) } : null,
          regexp: mw.regexp && mw.regexp.toString ? mw.regexp.toString() : String(mw.regexp),
        };
      });
      console.log('router.stack summary:', stackSummary.slice(0,50));
    }catch(e){ console.warn('Unable to enumerate app/router details', e); }

    const server = app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} already in use (EADDRINUSE)`);
      }
      console.error('Server listen error:', err);
      // exit so supervising platform (Render / local) surfaces the failure
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    // Ensure crash so Render shows failure and restarts
    process.exit(1);
  }
}

// Global handlers to surface errors in logs
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

start();
