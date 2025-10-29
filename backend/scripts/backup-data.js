#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = { stdout: false, dir: '', file: '' };
  args.forEach(arg => {
    if(arg === '--stdout'){
      opts.stdout = true;
      return;
    }
    const [key, value] = arg.split('=');
    if(key === '--dir' && value){
      opts.dir = value;
      return;
    }
    if(key === '--file' && value){
      opts.file = value;
    }
  });
  return opts;
};

const formatTimestamp = date => {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
};

async function main(){
  const { stdout, dir, file } = parseArgs();
  const now = new Date();
  const timestamp = now.toISOString();
  const suffix = formatTimestamp(now);

  const [properties, prospects] = await Promise.all([
    prisma.property.findMany({
      orderBy: { slug: 'asc' },
      include: {
        prospects: {
          orderBy: { slug: 'asc' },
          select: {
            id: true,
            slug: true,
            titolo: true,
            indirizzo1: true,
            indirizzo2: true,
            createdAt: true,
            updatedAt: true,
            pdfPath: true,
            propertyId: true,
          },
        },
      },
    }),
    prisma.prospect.findMany({
      orderBy: { slug: 'asc' },
      include: {
        property: {
          select: { id: true, slug: true, nome: true },
        },
      },
    }),
  ]);

  const payload = {
    generatedAt: timestamp,
    counts: {
      properties: properties.length,
      prospects: prospects.length,
    },
    properties,
    prospects,
  };

  if(stdout){
    process.stdout.write(JSON.stringify(payload, null, 2));
    return;
  }

  const targetDir = path.resolve(dir || path.join(__dirname, '..', 'storage', 'backups'));
  const filename = file
    ? path.resolve(file)
    : path.join(targetDir, `backup-${suffix}.json`);

  const resolvedDir = path.dirname(filename);
  fs.mkdirSync(resolvedDir, { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(payload, null, 2));

  console.log(`Backup written to ${filename}`);
}

main()
  .catch(err => {
    console.error('Backup failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
