/*
  Warnings:

  - Added the required column `piNumber` to the `reanalysis_returns` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Backfill não-destrutivo: linhas existentes (dados de verificação manual,
-- anteriores a este campo) recebem um marcador explícito em vez de serem
-- apagadas; DEFAULT é removido em seguida, então todo INSERT novo exige o
-- valor real vindo da aplicação.
ALTER TABLE "reanalysis_returns" ADD COLUMN     "piNumber" TEXT NOT NULL DEFAULT '(sem PI registrado antes deste campo existir)';
ALTER TABLE "reanalysis_returns" ALTER COLUMN "piNumber" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "reanalysis_returns_combinationId_piNumber_idx" ON "reanalysis_returns"("combinationId", "piNumber");
