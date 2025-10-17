-- CreateTable
CREATE TABLE "Prospect" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "indirizzo1" TEXT NOT NULL,
    "indirizzo2" TEXT DEFAULT '',
    "datiJson" JSONB NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "folder" TEXT DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_slug_key" ON "Prospect"("slug");
