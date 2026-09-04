import {
  CombinationState,
  DomainError,
  DomainEvent,
  EngineResult,
  MonthKey,
} from "./types";

/** YYYY-MM a partir de uma data local. Único ponto que define "mês" (item 9). */
export function monthKeyOf(at: Date): MonthKey {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Estado inicial de uma combinação Analista + Cliente + Meio recém-criada. */
export function createInitialState(): CombinationState {
  return {
    status: "EM_CONSTRUCAO",
    constructionCount: 0,
    monthlyReturnCount: 0,
    monthlyReturnMonthKey: null,
    releasedAt: null,
    lastReturnAt: null,
    lastReturnReason: null,
  };
}

export interface CorrectProcessInput {
  /** Diretriz vigente (Cliente+Meio) no momento do lançamento — busca sempre o valor
   *  ATUAL da diretriz (efeito imediato, item 4); não é um valor congelado no estado
   *  da combinação. Ver observação sobre alteração de diretriz em README.md. */
  guidelineTarget: number;
  at: Date;
}

/**
 * Processo correto lançado (item 14). Regra:
 * - Se já LIBERADO: só registra o processo, não mexe em contadores (item 6
 *   só fala em somar durante a construção).
 * - Se EM_CONSTRUCAO ou RETORNADO: soma 1 à construção vigente. Uma
 *   combinação RETORNADO só volta a ter uma construção real a partir do
 *   primeiro processo correto pós-retorno (decisão confirmada) — por isso
 *   é tratada aqui como início/continuação de construção, igual a
 *   EM_CONSTRUCAO. Se atingir a diretriz, libera automaticamente (item 6),
 *   sem exigir um segundo lançamento.
 */
export function applyCorrectProcess(
  state: CombinationState,
  input: CorrectProcessInput,
): EngineResult {
  const { guidelineTarget, at } = input;
  if (guidelineTarget <= 0) {
    throw new DomainError("Diretriz precisa ser maior que zero.");
  }

  if (state.status === "LIBERADO") {
    const events: DomainEvent[] = [
      {
        type: "PROCESS_CORRECT",
        at,
        detail: { contextState: "LIBERADO" },
      },
    ];
    return { state, events };
  }

  // EM_CONSTRUCAO ou RETORNADO
  const countBefore = state.constructionCount;
  const countAfter = countBefore + 1;
  const events: DomainEvent[] = [
    {
      type: "PROCESS_CORRECT",
      at,
      detail: { contextState: state.status, countBefore, countAfter, guidelineTarget },
    },
  ];

  if (countAfter >= guidelineTarget) {
    const newState: CombinationState = {
      ...state,
      status: "LIBERADO",
      constructionCount: countAfter,
      releasedAt: at,
      monthlyReturnCount: 0,
      monthlyReturnMonthKey: null,
    };
    events.push({
      type: "RELEASED",
      at,
      detail: { guidelineTarget, constructionCount: countAfter },
    });
    return { state: newState, events };
  }

  const newState: CombinationState = {
    ...state,
    status: "EM_CONSTRUCAO",
    constructionCount: countAfter,
  };
  return { state: newState, events };
}

export interface ReturnInput {
  at: Date;
  reason: string;
}

/**
 * Devolução de reanálise (item 15). Aplica automaticamente a regra
 * correspondente ao estado atual da combinação:
 * - EM_CONSTRUCAO / RETORNADO → item 7: zera a construção vigente,
 *   independentemente de quantas devoluções já ocorreram no mês. NÃO
 *   incrementa `monthlyReturnCount` (esse contador é só da regra do item 8).
 * - LIBERADO → item 8: conta devoluções do mês (chave = mês de REGISTRO
 *   da devolução, item 9). 1ª devolução do mês → continua liberado. 2ª
 *   devolução do mesmo mês → RETORNADO, construção reinicia (zerada) e o
 *   contador da regra de retorno é zerado (só volta a existir quando a
 *   combinação for liberada de novo).
 */
export function applyReturn(
  state: CombinationState,
  input: ReturnInput,
): EngineResult {
  const { at, reason } = input;
  const monthKey = monthKeyOf(at);

  if (state.status === "EM_CONSTRUCAO" || state.status === "RETORNADO") {
    const countBefore = state.constructionCount;
    const newState: CombinationState = {
      ...state,
      // RETORNADO permanece RETORNADO (decisão confirmada: só sai desse
      // status no próximo processo correto, ver applyCorrectProcess).
      // EM_CONSTRUCAO permanece EM_CONSTRUCAO, apenas zerada (item 7).
      status: state.status,
      constructionCount: 0,
      lastReturnAt: at,
      lastReturnReason: reason,
    };
    const events: DomainEvent[] = [
      {
        type: "RETURN_RESET",
        at,
        detail: { contextState: state.status, countBefore, countAfter: 0, reason },
      },
    ];
    return { state: newState, events };
  }

  // LIBERADO
  const carriedCount =
    state.monthlyReturnMonthKey === monthKey ? state.monthlyReturnCount : 0;
  const countInMonth = carriedCount + 1;

  const events: DomainEvent[] = [
    {
      type: "RETURN_COUNTED",
      at,
      detail: { contextState: "LIBERADO", monthKey, countInMonth, reason },
    },
  ];

  if (countInMonth >= 2) {
    const newState: CombinationState = {
      ...state,
      status: "RETORNADO",
      constructionCount: 0,
      monthlyReturnCount: 0,
      monthlyReturnMonthKey: null,
      lastReturnAt: at,
      lastReturnReason: reason,
    };
    events.push({
      type: "AUTO_RETURN",
      at,
      detail: { reason, monthKey, countInMonth },
    });
    return { state: newState, events };
  }

  const newState: CombinationState = {
    ...state,
    monthlyReturnCount: countInMonth,
    monthlyReturnMonthKey: monthKey,
    lastReturnAt: at,
    lastReturnReason: reason,
  };
  return { state: newState, events };
}

export interface ManualResetInput {
  at: Date;
  reason: string;
  performedByUserId: string;
}

/** Reset manual de uma construção vigente (item 11). Só faz sentido em EM_CONSTRUCAO. */
export function applyManualReset(
  state: CombinationState,
  input: ManualResetInput,
): EngineResult {
  if (state.status !== "EM_CONSTRUCAO") {
    throw new DomainError(
      `Reset manual só é válido para combinações EM_CONSTRUCAO (status atual: ${state.status}).`,
    );
  }
  const countBefore = state.constructionCount;
  const newState: CombinationState = { ...state, constructionCount: 0 };
  const events: DomainEvent[] = [
    {
      type: "MANUAL_RESET",
      at: input.at,
      detail: {
        countBefore,
        countAfter: 0,
        reason: input.reason,
        performedByUserId: input.performedByUserId,
      },
    },
  ];
  return { state: newState, events };
}

export interface ManualReturnInput {
  at: Date;
  reason: string;
  performedByUserId: string;
}

/** Retorno manual de uma combinação liberada (item 12). Só faz sentido em LIBERADO. */
export function applyManualReturn(
  state: CombinationState,
  input: ManualReturnInput,
): EngineResult {
  if (state.status !== "LIBERADO") {
    throw new DomainError(
      `Retorno manual só é válido para combinações LIBERADO (status atual: ${state.status}).`,
    );
  }
  const newState: CombinationState = {
    ...state,
    status: "RETORNADO",
    constructionCount: 0,
    monthlyReturnCount: 0,
    monthlyReturnMonthKey: null,
    lastReturnAt: input.at,
    lastReturnReason: input.reason,
  };
  const events: DomainEvent[] = [
    {
      type: "MANUAL_RETURN",
      at: input.at,
      detail: { reason: input.reason, performedByUserId: input.performedByUserId },
    },
  ];
  return { state: newState, events };
}
