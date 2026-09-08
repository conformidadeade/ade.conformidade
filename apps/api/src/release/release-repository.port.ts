import { CombinationState, DomainEvent } from "@reanalise-erp/release-engine";
import { ReturnOrigin } from "@reanalise-erp/types";

export interface CombinationRecord {
  id: string;
  analystId: string;
  clientId: string;
  mediaChannelId: string;
  state: CombinationState;
}

export interface FindOrCreateCombinationInput {
  analystId: string;
  clientId: string;
  mediaChannelId: string;
}

export interface CreateProcessInput {
  combinationId: string;
  piNumber: string;
  analysisDate: Date;
  result: "CORRETO" | "INCORRETO";
  observation?: string;
  recordedByUserId: string;
}

export interface CreateReturnInput {
  combinationId: string;
  /** Nº do PI devolvido — texto livre, sempre aceito (adendo Fase 2, item 1). */
  piNumber: string;
  /** Vínculo automático e silencioso — resolvido pelo service via findProcessByPiNumber, nunca informado pelo usuário. */
  processId?: string;
  reason: string;
  observation?: string;
  occurredAt: Date;
  registeredByUserId: string;
  /** Estado da combinação ANTES de aplicar a devolução (item 10). */
  contextState: CombinationState["status"];
  monthKey: string;
  /** Adendo "Origem da devolução" — puramente informativa, nunca lida pelo release-engine. */
  origin: ReturnOrigin;
}

export interface SaveStateAndEventsInput {
  combinationId: string;
  state: CombinationState;
  events: DomainEvent[];
  performedByUserId?: string;
}

/**
 * Porta de persistência usada pelo ReleaseService. Mantém a orquestração
 * de negócio (release.service.ts) desacoplada do Prisma, permitindo
 * testá-la com um fake em memória (ver release.service.spec.ts) sem
 * precisar de um banco real.
 */
export interface ReleaseRepositoryPort {
  findOrCreateCombination(input: FindOrCreateCombinationInput): Promise<CombinationRecord>;
  /** Lança CombinationNotFoundError se a combinação ainda não existir. */
  getCombination(input: FindOrCreateCombinationInput): Promise<CombinationRecord>;
  /** Lança GuidelineNotConfiguredError se não houver diretriz ativa para o par. */
  getCurrentGuidelineTarget(input: { clientId: string; mediaChannelId: string }): Promise<number>;
  findDuplicateProcess(input: {
    combinationId: string;
    piNumber: string;
    analysisDate: Date;
  }): Promise<{ id: string } | null>;
  /**
   * Vínculo automático da devolução (item 1): busca o AnalyzedProcess mais
   * recente com o mesmo PI nesta combinação. Não encontrar é o caminho
   * normal para combinações já LIBERADAS (o processo nunca passou pela
   * reanálise) — não é um erro.
   */
  findProcessByPiNumber(input: { combinationId: string; piNumber: string }): Promise<{ id: string } | null>;
  createProcess(input: CreateProcessInput): Promise<{ id: string }>;
  /**
   * Origem automática do Mapa de Habilidades (adendo Fase 2, item 6.2):
   * todo lançamento correto marca a habilidade correspondente e registra
   * o PI como evidência, na mesma transação do processo — sistema
   * paralelo ao motor de reanálise (item 6.5), nunca lido por ele.
   */
  recordSkillEvidence(input: {
    analystId: string;
    clientId: string;
    mediaChannelId: string;
    piNumber: string;
    recordedByUserId: string;
  }): Promise<void>;
  createReturn(input: CreateReturnInput): Promise<{ id: string }>;
  saveStateAndEvents(input: SaveStateAndEventsInput): Promise<void>;
}

/**
 * Unidade de trabalho: garante que toda a sequência (ler combinação,
 * checar duplicidade, aplicar a regra pura, gravar processo/devolução,
 * gravar estado+eventos) acontece em UMA transação atômica — é isto que
 * impede inconsistência sob concorrência (item 29).
 */
export interface ReleaseUnitOfWork {
  runInTransaction<T>(work: (repo: ReleaseRepositoryPort) => Promise<T>): Promise<T>;
}

export const RELEASE_UOW = Symbol("RELEASE_UOW");
