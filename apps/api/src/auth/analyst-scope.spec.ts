import { scopeAnalystId, UNLINKED_ANALYST_SENTINEL } from "./analyst-scope";
import { AuthenticatedUser } from "./jwt-payload";

describe("scopeAnalystId (adendo Acesso restrito, item 1)", () => {
  test("ANALISTA: qualquer analystId recebido é ignorado, sempre retorna o do próprio usuário", () => {
    const user: AuthenticatedUser = { id: "u1", role: "ANALISTA", analystId: "analyst-a" };
    expect(scopeAnalystId(user, "analyst-b-de-outra-pessoa")).toBe("analyst-a");
    expect(scopeAnalystId(user, undefined)).toBe("analyst-a");
  });

  test("ANALISTA sem Analyst vinculado: retorna o sentinel que nunca corresponde a um registro real", () => {
    const user: AuthenticatedUser = { id: "u1", role: "ANALISTA", analystId: null };
    expect(scopeAnalystId(user, "qualquer-coisa")).toBe(UNLINKED_ANALYST_SENTINEL);
  });

  test("LIDERANCA/ADMINISTRADOR: valor recebido passa direto, sem override", () => {
    const lideranca: AuthenticatedUser = { id: "u2", role: "LIDERANCA", analystId: null };
    const admin: AuthenticatedUser = { id: "u3", role: "ADMINISTRADOR", analystId: null };
    expect(scopeAnalystId(lideranca, "analyst-x")).toBe("analyst-x");
    expect(scopeAnalystId(lideranca, undefined)).toBeUndefined();
    expect(scopeAnalystId(admin, "analyst-y")).toBe("analyst-y");
  });
});
