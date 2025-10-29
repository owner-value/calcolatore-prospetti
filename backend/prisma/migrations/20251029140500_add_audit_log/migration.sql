CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" TEXT NOT NULL,
  "slug" TEXT,
  "propertySlug" TEXT,
  "requestMethod" TEXT,
  "requestPath" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "meta" JSONB
);

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");
