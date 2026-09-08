import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CsrfGuard } from "./csrf.guard";

function contextFor(method: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, cookies, headers }) }),
  } as unknown as ExecutionContext;
}

describe("CsrfGuard (adendo 'Segurança de sessão', item 2)", () => {
  const guard = new CsrfGuard();

  test("GET (leitura) sempre passa, mesmo sem header CSRF", () => {
    expect(guard.canActivate(contextFor("GET", { [CSRF_COOKIE_NAME]: "abc" }))).toBe(true);
  });

  test("POST sem cookie XSRF-TOKEN presente passa (não há sessão para proteger ainda — ex.: login)", () => {
    expect(guard.canActivate(contextFor("POST", {}, {}))).toBe(true);
  });

  test("POST com cookie XSRF-TOKEN mas SEM o header correspondente é bloqueado", () => {
    expect(() => guard.canActivate(contextFor("POST", { [CSRF_COOKIE_NAME]: "abc" }, {}))).toThrow(
      ForbiddenException,
    );
  });

  test("POST com header CSRF diferente do cookie é bloqueado", () => {
    expect(() =>
      guard.canActivate(contextFor("POST", { [CSRF_COOKIE_NAME]: "abc" }, { [CSRF_HEADER_NAME]: "outro-valor" })),
    ).toThrow(ForbiddenException);
  });

  test("POST com header CSRF igual ao cookie passa", () => {
    expect(guard.canActivate(contextFor("POST", { [CSRF_COOKIE_NAME]: "abc" }, { [CSRF_HEADER_NAME]: "abc" }))).toBe(
      true,
    );
  });

  test.each(["PUT", "PATCH", "DELETE"])("%s também é protegido (não só POST)", (method) => {
    expect(() => guard.canActivate(contextFor(method, { [CSRF_COOKIE_NAME]: "abc" }, {}))).toThrow(
      ForbiddenException,
    );
  });
});
