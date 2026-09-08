import { PasswordService } from "../auth/password.service";
import { UsersService } from "./users.service";

/**
 * Cobertura mínima da troca de senha via UpdateUserDto (adendo "Deploy
 * limpo", 08/09/2026) — a lacuna que motivou essa pequena extensão: hoje
 * não existe nenhum outro jeito de um ADMINISTRADOR redefinir a senha de
 * um usuário (nem a própria) depois da criação.
 */
describe("UsersService.update — troca de senha", () => {
  function buildFake(user: { id: string; name: string; role: string; active: boolean; analystId: string | null }) {
    const updateCalls: any[] = [];
    const auditCalls: any[] = [];
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn(async () => user),
        update: jest.fn(async ({ data, select }: any) => {
          updateCalls.push(data);
          const merged = { ...user, ...data };
          const result: any = {};
          for (const key of Object.keys(select)) result[key] = merged[key];
          return result;
        }),
      },
    };
    const auditLog = { record: jest.fn(async (input: any) => auditCalls.push(input)) };
    return { prisma, auditLog, updateCalls, auditCalls };
  }

  test("com 'password' informado: hash real é calculado e gravado como passwordHash", async () => {
    const { prisma, auditLog, updateCalls } = buildFake({
      id: "u1",
      name: "Admin",
      role: "ADMINISTRADOR",
      active: true,
      analystId: null,
    });
    const service = new UsersService(prisma as never, new PasswordService(), auditLog as never);

    await service.update("u1", { password: "nova-senha-forte" }, "performer-1");

    expect(updateCalls[0].passwordHash).toBeDefined();
    expect(updateCalls[0].passwordHash).not.toBe("nova-senha-forte");
    // hash argon2 real, não um valor fixo/placeholder.
    expect(updateCalls[0].passwordHash).toMatch(/^\$argon2/);
  });

  test("sem 'password' (campo ausente): passwordHash não é tocado", async () => {
    const { prisma, updateCalls, auditLog } = buildFake({
      id: "u1",
      name: "Admin",
      role: "ADMINISTRADOR",
      active: true,
      analystId: null,
    });
    const service = new UsersService(prisma as never, new PasswordService(), auditLog as never);

    await service.update("u1", { name: "Admin Renomeado" }, "performer-1");

    expect(updateCalls[0]).not.toHaveProperty("passwordHash");
  });

  test("audit log nunca recebe o hash da senha em texto (só a flag passwordChanged)", async () => {
    const { prisma, auditLog } = buildFake({
      id: "u1",
      name: "Admin",
      role: "ADMINISTRADOR",
      active: true,
      analystId: null,
    });
    const service = new UsersService(prisma as never, new PasswordService(), auditLog as never);

    await service.update("u1", { password: "nova-senha-forte" }, "performer-1");

    const recorded = auditLog.record.mock.calls[0][0];
    expect(recorded.after).not.toHaveProperty("passwordHash");
    expect(recorded.after.passwordChanged).toBe(true);
  });
});
