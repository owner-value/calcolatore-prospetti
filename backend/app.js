require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const storageDir = path.join(__dirname, 'storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
const upload = multer({ dest: storageDir });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/files', express.static(storageDir));

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

    const prospect = await prisma.prospect.findUnique({ where: { slug } });
    if (!prospect) return res.status(404).json({ error: 'Not found' });

    if (prospect.pdfPath) {
      const filePath = path.join(storageDir, prospect.pdfPath);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { console.warn('Unable to delete file', err); }
      }
    }

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

    await prisma.property.delete({ where: { slug } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
