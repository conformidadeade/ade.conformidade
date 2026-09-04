import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function contextWithUser(user: { role: string } | undefined, roles: string[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe("RolesGuard", () => {
  test("sem @Roles() no handler, libera qualquer usuário autenticado", () => {
    const { guard, context } = contextWithUser({ role: "ANALISTA" }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  test("usuário com papel permitido passa", () => {
    const { guard, context } = contextWithUser({ role: "LIDERANCA" }, ["LIDERANCA", "ADMINISTRADOR"]);
    expect(guard.canActivate(context)).toBe(true);
  });

  test("usuário com papel não permitido é rejeitado (item 21)", () => {
    const { guard, context } = contextWithUser({ role: "ANALISTA" }, ["LIDERANCA", "ADMINISTRADOR"]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  test("sem usuário autenticado no request é rejeitado mesmo com roles definidos", () => {
    const { guard, context } = contextWithUser(undefined, ["ADMINISTRADOR"]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
