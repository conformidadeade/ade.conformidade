-- CreateEnum
CREATE TYPE "SkillEvidenceOrigin" AS ENUM ('LANCAMENTO', 'MANUAL', 'IMPORTACAO');

-- CreateTable
CREATE TABLE "analyst_skills" (
    "id" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mediaChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyst_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyst_skill_evidences" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "piNumber" TEXT NOT NULL,
    "origin" "SkillEvidenceOrigin" NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyst_skill_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analyst_skills_analystId_clientId_mediaChannelId_key" ON "analyst_skills"("analystId", "clientId", "mediaChannelId");

-- CreateIndex
CREATE INDEX "analyst_skill_evidences_skillId_createdAt_idx" ON "analyst_skill_evidences"("skillId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "analysts_name_key" ON "analysts"("name");

-- AddForeignKey
ALTER TABLE "analyst_skills" ADD CONSTRAINT "analyst_skills_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "analysts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_skills" ADD CONSTRAINT "analyst_skills_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_skills" ADD CONSTRAINT "analyst_skills_mediaChannelId_fkey" FOREIGN KEY ("mediaChannelId") REFERENCES "media_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_skill_evidences" ADD CONSTRAINT "analyst_skill_evidences_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "analyst_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyst_skill_evidences" ADD CONSTRAINT "analyst_skill_evidences_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
