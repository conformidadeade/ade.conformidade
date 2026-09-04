-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMINISTRADOR', 'LIDERANCA', 'ANALISTA');

-- CreateEnum
CREATE TYPE "CombinationStatus" AS ENUM ('EM_CONSTRUCAO', 'LIBERADO', 'RETORNADO');

-- CreateEnum
CREATE TYPE "ProcessResult" AS ENUM ('CORRETO', 'INCORRETO');

-- CreateEnum
CREATE TYPE "ReanalysisEventType" AS ENUM ('PROCESS_CORRECT', 'RELEASED', 'RETURN_RESET', 'RETURN_COUNTED', 'AUTO_RETURN', 'MANUAL_RESET', 'MANUAL_RETURN', 'GUIDELINE_CHANGED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analystId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guidelines" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mediaChannelId" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "returnLimit" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "guidelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyst_client_media" (
    "id" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mediaChannelId" TEXT NOT NULL,
    "status" "CombinationStatus" NOT NULL DEFAULT 'EM_CONSTRUCAO',
    "constructionCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyReturnCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyReturnMonthKey" TEXT,
    "releasedAt" TIMESTAMP(3),
    "lastReturnAt" TIMESTAMP(3),
    "lastReturnReason" TEXT,
    "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyst_client_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyzed_processes" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "piNumber" TEXT NOT NULL,
    "analysisDate" TIMESTAMP(3) NOT NULL,
    "result" "ProcessResult" NOT NULL,
    "observation" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyzed_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reanalysis_returns" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "processId" TEXT,
    "reason" TEXT NOT NULL,
    "observation" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "registeredByUserId" TEXT NOT NULL,
    "contextState" "CombinationStatus" NOT NULL,
    "monthKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reanalysis_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reanalysis_events" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "type" "ReanalysisEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "detail" JSONB NOT NULL,
    "performedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reanalysis_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_analystId_key" ON "users"("analystId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_name_key" ON "clients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "media_channels_name_key" ON "media_channels"("name");

-- CreateIndex
CREATE INDEX "guidelines_clientId_mediaChannelId_active_idx" ON "guidelines"("clientId", "mediaChannelId", "active");

-- CreateIndex
CREATE INDEX "analyst_client_media_status_idx" ON "analyst_client_media"("status");

-- CreateIndex
CREATE UNIQUE INDEX "analyst_client_media_analystId_clientId_mediaChannelId_key" ON "analyst_client_media"("analystId", "clientId", "mediaChannelId");

-- CreateIndex
CREATE INDEX "analyzed_processes_combinationId_piNumber_analysisDate_idx" ON "analyzed_processes"("combinationId", "piNumber", "analysisDate");

-- CreateIndex
CREATE INDEX "reanalysis_returns_combinationId_monthKey_idx" ON "reanalysis_returns"("combinationId", "monthKey");

-- CreateIndex
CREATE INDEX "reanalysis_returns_combinationId_contextState_monthKey_idx" ON "reanalysis_returns"("combinationId", "contextState", "monthKey");

-- CreateIndex
CREATE INDEX "reanalysis_events_combinationId_occurredAt_idx" ON "reanalysis_events"("combinationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "analysts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_mediaChannelId_fkey" FOREIGN KEY ("mediaChannelId") REFERENCES "media_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_client_media" ADD CONSTRAINT "analyst_client_media_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "analysts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_client_media" ADD CONSTRAINT "analyst_client_media_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_client_media" ADD CONSTRAINT "analyst_client_media_mediaChannelId_fkey" FOREIGN KEY ("mediaChannelId") REFERENCES "media_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyzed_processes" ADD CONSTRAINT "analyzed_processes_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "analyst_client_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyzed_processes" ADD CONSTRAINT "analyzed_processes_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reanalysis_returns" ADD CONSTRAINT "reanalysis_returns_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "analyst_client_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reanalysis_returns" ADD CONSTRAINT "reanalysis_returns_processId_fkey" FOREIGN KEY ("processId") REFERENCES "analyzed_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reanalysis_returns" ADD CONSTRAINT "reanalysis_returns_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reanalysis_events" ADD CONSTRAINT "reanalysis_events_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "analyst_client_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reanalysis_events" ADD CONSTRAINT "reanalysis_events_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
