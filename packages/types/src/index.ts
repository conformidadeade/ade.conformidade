/**
 * Tipos compartilhados entre `apps/api` e `apps/web`.
 *
 * Os enums abaixo espelham deliberadamente os enums do `schema.prisma`
 * (mantidos em sincronia manualmente) para que o frontend não precise
 * importar o Prisma Client só para ter os literais de status.
 */

export type CombinationStatus = "EM_CONSTRUCAO" | "LIBERADO" | "RETORNADO";

export type ProcessResult = "CORRETO" | "INCORRETO";

/**
 * Origem de uma devolução (adendo "Origem da devolução", 08/09/2026) —
 * dimensão puramente informativa/de relatório, independente de
 * CombinationStatus/contextState e nunca lida por packages/release-engine.
 */
export type ReturnOrigin = "REANALISE" | "CLIENTE";

export type UserRole = "ADMINISTRADOR" | "LIDERANCA" | "ANALISTA";

export type ReanalysisEventType =
  | "PROCESS_CORRECT"
  | "RELEASED"
  | "RETURN_RESET"
  | "RETURN_COUNTED"
  | "AUTO_RETURN"
  | "MANUAL_RESET"
  | "MANUAL_RETURN"
  | "GUIDELINE_CHANGED";

/** Linha do Mapa de Liberação (item 16). */
export interface CombinationSummary {
  id: string;
  analystId: string;
  analystName: string;
  clientId: string;
  clientName: string;
  mediaChannelId: string;
  mediaChannelName: string;
  status: CombinationStatus;
  guidelineTarget: number;
  constructionCount: number;
  missingCount: number;
  monthlyReturnCount: number;
  monthlyReturnMonthKey: string | null;
  lastMovementAt: string | null;
  releasedAt: string | null;
  lastReturnAt: string | null;
  lastReturnReason: string | null;
}

/**
 * Indicadores do dashboard (item 20). Adendo "Dashboard: mostrar totais de
 * todos os períodos" (08/09/2026) — todo campo aqui é um total acumulado
 * desde sempre, não escopado a um mês; não confundir com
 * `CombinationSummary.monthlyReturnCount` (Mapa de Liberação) nem com a
 * regra "2 devoluções no mês" do release-engine, que continuam mensais.
 */
export interface DashboardIndicators {
  totalActiveAnalysts: number;
  combinationsInConstruction: number;
  combinationsReleased: number;
  returnsToReanalysisTotal: number;
  reportedReturnsTotal: number;
  releasesTotal: number;
  releasesByClient: { clientId: string; clientName: string; count: number }[];
  releasesByMediaChannel: { mediaChannelId: string; mediaChannelName: string; count: number }[];
  returnsByClient: { clientId: string; clientName: string; count: number }[];
  returnsByMediaChannel: { mediaChannelId: string; mediaChannelName: string; count: number }[];
  /** Adendo "Origem da devolução", item 5 — sempre as duas origens, mesmo com contagem 0. */
  reportedReturnsByOrigin: { origin: ReturnOrigin; count: number }[];
}
