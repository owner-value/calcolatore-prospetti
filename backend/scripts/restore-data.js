#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const askConfirm = async message => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => new Promise(resolve => rl.question(`${message} (y/N) `, resolve));
  const answer = (await prompt()).trim().toLowerCase();
  rl.close();
  return ['y', 'yes'].includes(answer);
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { file: '', dryRun: false, truncate: false, force: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--truncate' || arg === '--reset') {
      options.truncate = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
      continue;
    }
    if (arg === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i += 1;
      continue;
    }
    if (!options.file && !arg.startsWith('--')) {
      options.file = arg;
      continue;
    }
  }

  return options;
};

const normalizeSlug = value => {
  if (!value) return '';
  return value.toString().trim();
};

const cloneJson = data => {
  if (!data || typeof data !== 'object') return data;
  return JSON.parse(JSON.stringify(data));
};

async function main() {
  const options = parseArgs();
  if (!options.file) {
    console.error('Usage: npm run restore -- --file <backup.json> [--dry-run] [--truncate] [--force]');
    process.exit(1);
  }

  const candidates = [
    path.resolve(options.file),
    path.resolve(__dirname, options.file),
    path.resolve(__dirname, '..', options.file),
    path.resolve(__dirname, '..', '..', options.file),
  ];

  const filePathArg = candidates.find(p => fs.existsSync(p));
  if (!filePathArg) {
    console.error(`Backup file not found (looked in):\n - ${candidates.join('\n - ')}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePathArg, 'utf8');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error('Unable to parse backup JSON:', err.message);
    process.exit(1);
  }

  const properties = Array.isArray(payload.properties) ? payload.properties : [];
  const prospects = Array.isArray(payload.prospects) ? payload.prospects : [];

  console.log(`Backup: ${filePathArg}`);
  console.log(`Generated at: ${payload.generatedAt || 'n/a'}`);
  console.log(`Properties in file: ${properties.length}`);
  console.log(`Prospects in file: ${prospects.length}`);

  if (options.dryRun) {
    console.log('Dry-run mode: no changes will be applied.');
    return;
  }

  if (options.truncate && !options.force) {
    const confirmed = await askConfirm('This will delete all existing properties and prospects before restore. Continue?');
    if (!confirmed) {
      console.log('Restore aborted by user.');
      return;
    }
  }

  const propertySlugToName = new Map();
  let createdProps = 0;
  let updatedProps = 0;
  let createdProspects = 0;
  let updatedProspects = 0;

  await prisma.$transaction(async tx => {
    if (options.truncate) {
      await tx.prospect.deleteMany({});
      await tx.property.deleteMany({});
    }

    for (const item of properties) {
      const slug = normalizeSlug(item.slug);
      if (!slug) continue;
      const data = {
        nome: item.nome || '',
        indirizzo: item.indirizzo || '',
        citta: item.citta || '',
        ownerNome: item.ownerNome || '',
        ownerEmail: item.ownerEmail || '',
        ownerTelefono: item.ownerTelefono || '',
        note: item.note || '',
      };

      const saved = await tx.property.upsert({
        where: { slug },
        create: { slug, ...data },
        update: data,
      });

      if (saved.createdAt.getTime() === saved.updatedAt.getTime()) {
        createdProps += 1;
      } else {
        updatedProps += 1;
      }
      propertySlugToName.set(slug, saved.nome || slug);
    }

    for (const item of prospects) {
      const slug = normalizeSlug(item.slug);
      if (!slug) continue;

      const propertySlugCandidates = [
        normalizeSlug(item.property?.slug),
        normalizeSlug(item.propertySlug),
        normalizeSlug(item.datiJson?.propertySlug),
      ];
      let propertySlug = propertySlugCandidates.find(Boolean) || '';
      if (!propertySlug && Array.isArray(properties)) {
        const match = properties.find(prop => Array.isArray(prop.prospects) && prop.prospects.some(p => normalizeSlug(p.slug) === slug));
        if (match) propertySlug = normalizeSlug(match.slug);
      }
      if (propertySlug && !propertySlugToName.has(propertySlug)) {
        console.warn(`Property slug "${propertySlug}" referenced by prospect "${slug}" not found in backup. Prospect will be detached.`);
        propertySlug = '';
      }

      let datiJson = cloneJson(item.datiJson) || {};
      if (typeof datiJson === 'object' && datiJson !== null) {
        datiJson.propertySlug = propertySlug;
        datiJson.propertyName = propertySlug ? (propertySlugToName.get(propertySlug) || propertySlug) : '';
        if (datiJson.formState && typeof datiJson.formState === 'object') {
          datiJson.formState.propertySlug = propertySlug;
          if ('propertyName' in datiJson.formState) {
            datiJson.formState.propertyName = datiJson.propertyName;
          }
        }
      }

      const baseData = {
        titolo: item.titolo || item.indirizzo1 || slug,
        indirizzo1: item.indirizzo1 || '',
        indirizzo2: item.indirizzo2 || '',
        datiJson,
        pdfPath: item.pdfPath || '',
      };

      const updateData = { ...baseData };
      const createData = { slug, ...baseData };

      if (propertySlug) {
        updateData.property = { connect: { slug: propertySlug } };
        createData.property = { connect: { slug: propertySlug } };
      } else {
        updateData.property = { disconnect: true };
      }

      const saved = await tx.prospect.upsert({
        where: { slug },
        update: updateData,
        create: createData,
      });

      if (saved.createdAt.getTime() === saved.updatedAt.getTime()) {
        createdProspects += 1;
      } else {
        updatedProspects += 1;
      }
    }
  });

  console.log('Restore completed.');
  console.log(`Properties created: ${createdProps}`);
  console.log(`Properties updated: ${updatedProps}`);
  console.log(`Prospects created: ${createdProspects}`);
  console.log(`Prospects updated: ${updatedProspects}`);
}

main()
  .catch(err => {
    console.error('Restore failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
