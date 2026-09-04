/**
 * Tipos compartilhados entre `apps/api` e `apps/web`.
 *
 * Os enums abaixo espelham deliberadamente os enums do `schema.prisma`
 * (mantidos em sincronia manualmente) para que o frontend não precise
 * importar o Prisma Client só para ter os literais de status.
 */

export type CombinationStatus = "EM_CONSTRUCAO" | "LIBERADO" | "RETORNADO";

export type ProcessResult = "CORRETO" | "INCORRETO";

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

/** Indicadores do dashboard (item 20). */
export interface DashboardIndicators {
  totalActiveAnalysts: number;
  combinationsInConstruction: number;
  combinationsReleased: number;
  returnsToReanalysisThisMonth: number;
  reportedReturnsThisMonth: number;
  releasesThisMonth: number;
  releasesByClient: { clientId: string; clientName: string; count: number }[];
  releasesByMediaChannel: { mediaChannelId: string; mediaChannelName: string; count: number }[];
  returnsByClient: { clientId: string; clientName: string; count: number }[];
  returnsByMediaChannel: { mediaChannelId: string; mediaChannelName: string; count: number }[];
}
