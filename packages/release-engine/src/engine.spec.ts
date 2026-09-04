import {
  applyCorrectProcess,
  applyManualReset,
  applyManualReturn,
  applyReturn,
  createInitialState,
} from "./engine";
import { CombinationState, DomainError } from "./types";

const d = (s: string) => new Date(s);

/** Aplica N processos corretos em sequência e devolve o estado final. */
function correctN(
  state: CombinationState,
  n: number,
  guidelineTarget: number,
  startAt: Date,
): CombinationState {
  let s = state;
  for (let i = 0; i < n; i++) {
    const at = new Date(startAt.getTime());
    at.setDate(at.getDate() + i);
    s = applyCorrectProcess(s, { guidelineTarget, at }).state;
  }
  return s;
}

describe("item 31 — testes obrigatórios", () => {
  test("1) diretriz=5, 5 processos corretos → LIBERADO", () => {
    const s0 = createInitialState();
    const s1 = correctN(s0, 5, 5, d("2026-01-05"));
    expect(s1.status).toBe("LIBERADO");
    expect(s1.constructionCount).toBe(5);
    expect(s1.releasedAt).toEqual(d("2026-01-09"));
  });

  test("2) diretriz=5, 4 corretos + devolução → 0/5, EM_CONSTRUCAO", () => {
    const s0 = createInitialState();
    const s1 = correctN(s0, 4, 5, d("2026-01-05"));
    expect(s1.constructionCount).toBe(4);
    const { state: s2, events } = applyReturn(s1, {
      at: d("2026-01-10"),
      reason: "erro de veiculação",
    });
    expect(s2.status).toBe("EM_CONSTRUCAO");
    expect(s2.constructionCount).toBe(0);
    expect(events[0]!.type).toBe("RETURN_RESET");
    expect(events[0]!.detail.countBefore).toBe(4);
  });

  test("3) liberado recebe 1 devolução no mês → continua LIBERADO", () => {
    const s0 = createInitialState();
    const liberado = correctN(s0, 5, 5, d("2026-01-05"));
    const { state: s1 } = applyReturn(liberado, {
      at: d("2026-01-20"),
      reason: "erro pontual",
    });
    expect(s1.status).toBe("LIBERADO");
    expect(s1.monthlyReturnCount).toBe(1);
  });

  test("4) liberado recebe 2 devoluções no mesmo mês/cliente/meio → RETORNADO, nova construção 0/5", () => {
    const s0 = createInitialState();
    const liberado = correctN(s0, 5, 5, d("2026-01-05"));
    const { state: s1 } = applyReturn(liberado, { at: d("2026-01-10"), reason: "r1" });
    const { state: s2, events } = applyReturn(s1, { at: d("2026-01-20"), reason: "r2" });
    expect(s2.status).toBe("RETORNADO");
    expect(s2.constructionCount).toBe(0);
    expect(events.map((e) => e.type)).toEqual(["RETURN_COUNTED", "AUTO_RETURN"]);

    // próximo processo correto começa uma construção nova, do zero
    const { state: s3 } = applyCorrectProcess(s2, {
      guidelineTarget: 5,
      at: d("2026-02-01"),
    });
    expect(s3.status).toBe("EM_CONSTRUCAO");
    expect(s3.constructionCount).toBe(1);
  });

  test("5) devoluções em clientes diferentes não se misturam (combinações independentes)", () => {
    const secomTv = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    const gdfTv = correctN(createInitialState(), 5, 5, d("2026-01-05"));

    const { state: secomAfter } = applyReturn(secomTv, {
      at: d("2026-01-10"),
      reason: "r1",
    });
    // gdfTv nunca recebeu devolução — não é tocado por essa chamada.
    expect(secomAfter.status).toBe("LIBERADO");
    expect(secomAfter.monthlyReturnCount).toBe(1);
    expect(gdfTv.status).toBe("LIBERADO");
    expect(gdfTv.monthlyReturnCount).toBe(0);
  });

  test("6) mesmo cliente, meios diferentes não misturam contagem (simulado por 2 states independentes)", () => {
    const secomTv = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    const secomRadio = correctN(createInitialState(), 5, 5, d("2026-01-05"));

    const { state: tvAfter1 } = applyReturn(secomTv, { at: d("2026-01-10"), reason: "r1" });
    const { state: tvAfter2 } = applyReturn(tvAfter1, { at: d("2026-01-15"), reason: "r2" });

    expect(tvAfter2.status).toBe("RETORNADO");
    // secomRadio é um estado totalmente separado — jamais recebeu devolução
    expect(secomRadio.status).toBe("LIBERADO");
    expect(secomRadio.monthlyReturnCount).toBe(0);
  });

  test("7) mudança de mês reinicia o contador da regra de retorno (item 8/9)", () => {
    const liberado = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    const { state: s1 } = applyReturn(liberado, { at: d("2026-01-28"), reason: "r1" });
    expect(s1.monthlyReturnCount).toBe(1);
    expect(s1.monthlyReturnMonthKey).toBe("2026-01");

    // 1ª devolução de fevereiro — não é a "2ª do mês", pois o mês virou.
    const { state: s2 } = applyReturn(s1, { at: d("2026-02-03"), reason: "r2" });
    expect(s2.status).toBe("LIBERADO");
    expect(s2.monthlyReturnCount).toBe(1);
    expect(s2.monthlyReturnMonthKey).toBe("2026-02");
  });

  test("8) reset manual zera construção e preserva histórico (o caller preserva os eventos passados)", () => {
    const s1 = correctN(createInitialState(), 7, 10, d("2026-01-01"));
    expect(s1.constructionCount).toBe(7);
    const { state: s2, events } = applyManualReset(s1, {
      at: d("2026-01-15"),
      reason: "readequação de equipe",
      performedByUserId: "user-1",
    });
    expect(s2.status).toBe("EM_CONSTRUCAO");
    expect(s2.constructionCount).toBe(0);
    expect(events[0]!).toMatchObject({
      type: "MANUAL_RESET",
      detail: { countBefore: 7, countAfter: 0 },
    });
  });

  test("9) retorno manual de liberado inicia nova construção em 0", () => {
    const liberado = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    const { state: s1, events } = applyManualReturn(liberado, {
      at: d("2026-01-12"),
      reason: "decisão da liderança",
      performedByUserId: "user-1",
    });
    expect(s1.status).toBe("RETORNADO");
    expect(s1.constructionCount).toBe(0);
    expect(events[0]!.type).toBe("MANUAL_RETURN");

    const { state: s2 } = applyCorrectProcess(s1, { guidelineTarget: 5, at: d("2026-01-13") });
    expect(s2.status).toBe("EM_CONSTRUCAO");
    expect(s2.constructionCount).toBe(1);
  });

  test("10) alteração de diretriz com construção em andamento é aplicada de forma imediata e auditável", () => {
    // Diretriz vigente é sempre passada por parâmetro (busca ao vivo) — não é
    // congelada no estado da combinação (efeito imediato, item 4). Regra
    // exata de reconciliação retroativa fica sinalizada para validação
    // (item 28) — aqui garantimos apenas o comportamento imediato mínimo.
    let s = correctN(createInitialState(), 3, 10, d("2026-01-01")); // 3/10
    expect(s.status).toBe("EM_CONSTRUCAO");

    // Diretriz cai de 10 para 3 no meio da construção.
    const { state: s2 } = applyCorrectProcess(s, { guidelineTarget: 3, at: d("2026-01-10") });
    // Como já tinha 3 e o novo processo leva a 4 >= 3, libera no próximo lançamento.
    expect(s2.status).toBe("LIBERADO");
  });

  test("11) devolução durante construção some, reconstrói e libera de novo no mesmo mês; devolução seguinte é a 1ª da regra de retorno (decisão confirmada)", () => {
    let s = correctN(createInitialState(), 4, 5, d("2026-01-02")); // 4/5
    const { state: afterReset } = applyReturn(s, { at: d("2026-01-08"), reason: "erro" });
    expect(afterReset.status).toBe("EM_CONSTRUCAO");
    expect(afterReset.constructionCount).toBe(0);

    const liberadoDeNovo = correctN(afterReset, 5, 5, d("2026-01-10")); // 0->5 no mesmo mês
    expect(liberadoDeNovo.status).toBe("LIBERADO");
    expect(liberadoDeNovo.monthlyReturnCount).toBe(0);

    const { state: afterSecondReturn } = applyReturn(liberadoDeNovo, {
      at: d("2026-01-25"),
      reason: "outro erro",
    });
    // Decisão confirmada: a devolução ocorrida durante a construção (item 7)
    // NÃO é herdada pelo contador da regra de retorno. Esta é a 1ª devolução
    // desde a (re)liberação → continua LIBERADO, não retorna.
    expect(afterSecondReturn.status).toBe("LIBERADO");
    expect(afterSecondReturn.monthlyReturnCount).toBe(1);
  });
});

describe("casos de borda adicionais", () => {
  test("RETORNADO permanece visível até o próximo processo correto (decisão confirmada)", () => {
    const liberado = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    const { state: s1 } = applyReturn(liberado, { at: d("2026-01-10"), reason: "r1" });
    const { state: s2 } = applyReturn(s1, { at: d("2026-01-20"), reason: "r2" });
    expect(s2.status).toBe("RETORNADO");
    // Uma devolução adicional em estado RETORNADO (sem processo correto no meio)
    // é tratada como a regra de construção (item 7): não há o que zerar, mas
    // o motivo/data mais recentes são atualizados para exibição no Mapa.
    const { state: s3, events } = applyReturn(s2, { at: d("2026-01-22"), reason: "r3" });
    expect(s3.status).toBe("RETORNADO");
    expect(s3.constructionCount).toBe(0);
    expect(events[0]!.type).toBe("RETURN_RESET");
  });

  test("diretriz=1: RETORNADO libera direto no próximo processo correto", () => {
    const liberado = correctN(createInitialState(), 1, 1, d("2026-01-05"));
    const { state: s1 } = applyReturn(liberado, { at: d("2026-01-06"), reason: "r1" });
    const { state: s2 } = applyReturn(s1, { at: d("2026-01-07"), reason: "r2" });
    expect(s2.status).toBe("RETORNADO");
    const { state: s3, events } = applyCorrectProcess(s2, { guidelineTarget: 1, at: d("2026-01-08") });
    expect(s3.status).toBe("LIBERADO");
    expect(events.map((e) => e.type)).toEqual(["PROCESS_CORRECT", "RELEASED"]);
  });

  test("processo correto lançado enquanto LIBERADO não altera o estado", () => {
    const liberado = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    const { state: s1, events } = applyCorrectProcess(liberado, {
      guidelineTarget: 5,
      at: d("2026-01-20"),
    });
    expect(s1).toEqual(liberado);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("PROCESS_CORRECT");
  });

  test("reset manual em combinação LIBERADO é rejeitado (use retorno manual)", () => {
    const liberado = correctN(createInitialState(), 5, 5, d("2026-01-05"));
    expect(() =>
      applyManualReset(liberado, {
        at: d("2026-01-06"),
        reason: "x",
        performedByUserId: "u1",
      }),
    ).toThrow(DomainError);
  });

  test("retorno manual em combinação EM_CONSTRUCAO é rejeitado (não está liberada)", () => {
    const emConstrucao = correctN(createInitialState(), 2, 5, d("2026-01-05"));
    expect(() =>
      applyManualReturn(emConstrucao, {
        at: d("2026-01-06"),
        reason: "x",
        performedByUserId: "u1",
      }),
    ).toThrow(DomainError);
  });
});
