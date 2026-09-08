/*
  Warnings:

  - Added the required column `origin` to the `reanalysis_returns` table without a default value. This is not possible if the table is not empty.

  Ambiente de rede/produção nasce com o banco zerado (ver adendo "Deploy
  limpo") — esta tabela não terá nenhum registro pré-existente lá, então o
  campo é obrigatório desde o início nesse ambiente, sem precisar de
  backfill. O backfill abaixo existe só para o ambiente LOCAL de
  desenvolvimento (que optou por manter os dados atuais em vez de zerar —
  ver DECISIONS.md, 08/09/2026): as devoluções já registradas localmente
  recebem 'REANALISE' como valor arbitrário só para não travar a migration,
  já que a origem real delas não foi capturada quando foram criadas.
*/
-- CreateEnum
CREATE TYPE "ReturnOrigin" AS ENUM ('REANALISE', 'CLIENTE');

-- AlterTable: adiciona como opcional, faz backfill dos registros locais existentes, depois torna obrigatório.
ALTER TABLE "reanalysis_returns" ADD COLUMN     "origin" "ReturnOrigin";
UPDATE "reanalysis_returns" SET "origin" = 'REANALISE' WHERE "origin" IS NULL;
ALTER TABLE "reanalysis_returns" ALTER COLUMN "origin" SET NOT NULL;
