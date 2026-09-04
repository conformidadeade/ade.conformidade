/**
 * Modelo de domínio puro do motor de liberação de reanálise.
 *
 * Este módulo não depende de banco de dados, framework web nem relógio de
 * sistema (todo "agora" é recebido por parâmetro) — é isso que permite
 * testar as regras dos itens 6, 7, 8 e 9 do requisito sem precisar de
 * infraestrutura. A camada de persistência (Prisma/NestJS) chama estas
 * funções dentro de uma transação, grava os eventos retornados como
 * registros append-only e atualiza o "read model" da combinação com o
 * `state` resultante.
 */

/** Estado de uma combinação Analista + Cliente + Meio (item 5). */
export type CombinationStatus = "EM_CONSTRUCAO" | "LIBERADO" | "RETORNADO";

/**
 * "Chave de mês" no formato YYYY-MM, usada para a contagem mensal de
 * devoluções da regra de retorno (itens 8 e 9).
 *
 * Decisão confirmada com a liderança (item 9): o mês é definido pela data
 * de REGISTRO da devolução no sistema, não pela data de competência do
 * processo analisado.
 */
export type MonthKey = string;

export interface CombinationState {
  status: CombinationStatus;

  /**
   * Processos corretos acumulados na construção vigente. Válido para
   * EM_CONSTRUCAO (contagem em andamento) e RETORNADO (sempre 0 — a
   * construção só volta a existir de fato no próximo processo correto,
   * ver applyCorrectProcess). Não tem significado enquanto LIBERADO.
   */
  constructionCount: number;

  /**
   * Contador da REGRA DE RETORNO (item 8) — conta apenas devoluções
   * recebidas enquanto a combinação já está LIBERADO. É deliberadamente
   * um campo diferente do "contador de relatório" (item 10): devoluções
   * recebidas durante a construção nunca incrementam este campo, elas
   * apenas zeram `constructionCount` (item 7). Decisão confirmada: este
   * contador só passa a existir/contar a partir do momento em que a
   * combinação (re)atinge o status LIBERADO — uma devolução ocorrida
   * antes da liberação não é herdada por ele.
   */
  monthlyReturnCount: number;

  /** Mês/ano (YYYY-MM) a que `monthlyReturnCount` se refere. */
  monthlyReturnMonthKey: MonthKey | null;

  /** Data da liberação vigente (null se nunca esteve liberado ou se já retornou). */
  releasedAt: Date | null;

  /** Data da última devolução recebida, em qualquer estado (para exibição no Mapa, item 16). */
  lastReturnAt: Date | null;

  /** Motivo da última devolução recebida (para exibição no Mapa, item 16). */
  lastReturnReason: string | null;
}

export type DomainEventType =
  | "PROCESS_CORRECT"
  | "RELEASED"
  | "RETURN_RESET"
  | "RETURN_COUNTED"
  | "AUTO_RETURN"
  | "MANUAL_RESET"
  | "MANUAL_RETURN";

/**
 * Evento imutável de domínio (item 13/22/25) — é isto que deve ser
 * persistido em `release_events`/`reanalysis_returns` como fonte de
 * verdade. O `state` atual de uma combinação é sempre reconstruível a
 * partir da sequência de eventos; ele é mantido denormalizado só por
 * performance de listagem (Mapa de Liberação).
 */
export interface DomainEvent {
  type: DomainEventType;
  at: Date;
  detail: Record<string, unknown>;
}

export interface EngineResult {
  state: CombinationState;
  events: DomainEvent[];
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
