const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function run(){
  const sqlitePath = path.join(__dirname, '..', 'prisma', 'dev.db');
  const sqliteUrl = `file:${sqlitePath}`;

  const sqlitePrisma = new PrismaClient({
    datasources: { db: { url: sqliteUrl } }
  });
  const pgPrisma = new PrismaClient();

  console.log(`Leggo dati da ${sqlitePath}`);

  const sqliteProperties = await sqlitePrisma.property.findMany();
  const propertyById = new Map();

  for(const prop of sqliteProperties){
    const payload = {
      slug: prop.slug,
      nome: prop.nome,
      indirizzo: prop.indirizzo,
      citta: prop.citta,
      ownerNome: prop.ownerNome,
      ownerEmail: prop.ownerEmail,
      ownerTelefono: prop.ownerTelefono,
      note: prop.note,
      createdAt: prop.createdAt ? new Date(prop.createdAt) : undefined,
      updatedAt: prop.updatedAt ? new Date(prop.updatedAt) : undefined,
    };

    await pgPrisma.property.upsert({
      where: { slug: payload.slug },
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

    propertyById.set(prop.id, payload.slug);
  }

  console.log(`Importate ${sqliteProperties.length} proprieta`);

  const sqliteProspects = await sqlitePrisma.prospect.findMany();

  for(const item of sqliteProspects){
    let datiJson = item.datiJson;
    if(typeof datiJson === 'string'){
      try{ datiJson = JSON.parse(datiJson); }catch(err){ datiJson = null; }
    }
    const propertySlug = item.propertyId ? propertyById.get(item.propertyId) : null;
    if(datiJson && typeof datiJson === 'object'){
      datiJson.propertySlug = propertySlug || datiJson.propertySlug || '';
    }

    await pgPrisma.prospect.upsert({
      where: { slug: item.slug },
      update: {
        titolo: item.titolo,
        indirizzo1: item.indirizzo1,
        indirizzo2: item.indirizzo2,
        datiJson,
        pdfPath: item.pdfPath,
        folder: item.folder,
        ...(propertySlug
          ? { property: { connect: { slug: propertySlug } } }
          : { property: { disconnect: true } }),
      },
      create: {
        slug: item.slug,
        titolo: item.titolo,
        indirizzo1: item.indirizzo1,
        indirizzo2: item.indirizzo2,
        datiJson,
        pdfPath: item.pdfPath,
        folder: item.folder,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
        ...(propertySlug ? { property: { connect: { slug: propertySlug } } } : {}),
      },
    });
  }

  console.log(`Importati ${sqliteProspects.length} prospetti`);

  await sqlitePrisma.$disconnect();
  await pgPrisma.$disconnect();
}

run()
  .then(() => {
    console.log('Migrazione completata con successo.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Errore durante la migrazione:', err);
    process.exit(1);
  });
