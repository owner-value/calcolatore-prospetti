-- CreateTable
CREATE TABLE "Property" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "indirizzo" TEXT,
    "citta" TEXT,
    "ownerNome" TEXT,
    "ownerEmail" TEXT,
    "ownerTelefono" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "indirizzo1" TEXT NOT NULL,
    "indirizzo2" TEXT DEFAULT '',
    "datiJson" JSONB NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "folder" TEXT DEFAULT '',
    "propertyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Property_slug_key" ON "Property"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_slug_key" ON "Prospect"("slug");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
