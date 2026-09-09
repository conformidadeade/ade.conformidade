import { PasswordService } from "../auth/password.service";
import { UsersService } from "./users.service";

/**
 * Cobertura de UsersService: troca de senha via UpdateUserDto (adendo
 * "Deploy limpo", 08/09/2026) e o fluxo de convite por e-mail (adendo
 * "Confirmação de e-mail e recuperação de senha", 09/09/2026) — contas
 * novas nascem sem senha, com um convite enviado.
 */
describe("UsersService", () => {
  function buildFake(user: {
    id: string;
    name: string;
    email?: string;
    role: string;
    active: boolean;
    analystId: string | null;
    passwordHash?: string | null;
    emailConfirmedAt?: Date | null;
  }) {
    const fullUser = { email: "user@teste.local", passwordHash: null, emailConfirmedAt: null, ...user };
    const updateCalls: any[] = [];
    const createCalls: any[] = [];
    const auditCalls: any[] = [];
    const invalidateCalls: any[] = [];
    const issueCalls: any[] = [];
    const sentInvites: any[] = [];

    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn(async () => fullUser),
        create: jest.fn(async ({ data, select }: any) => {
          createCalls.push(data);
          const merged = { id: "new-user-id", createdAt: new Date(), ...data };
          const result: any = {};
          for (const key of Object.keys(select)) result[key] = merged[key];
          return result;
        }),
        update: jest.fn(async ({ data, select }: any) => {
          updateCalls.push(data);
          const merged = { ...fullUser, ...data };
          const result: any = {};
          for (const key of Object.keys(select)) result[key] = merged[key];
          return result;
        }),
      },
    };
    const auditLog = { record: jest.fn(async (input: any) => auditCalls.push(input)) };
    const authTokens = {
      issue: jest.fn(async (userId: string, type: string) => {
        issueCalls.push({ userId, type });
        return "fake-token";
      }),
      invalidatePending: jest.fn(async (userId: string, type: string) => invalidateCalls.push({ userId, type })),
    };
    const email = {
      sendInviteEmail: jest.fn(async (to: string, name: string, link: string) => sentInvites.push({ to, name, link })),
    };
    const config = { get: jest.fn((_key: string, def?: string) => def) };

    return { prisma, auditLog, authTokens, email, config, updateCalls, createCalls, auditCalls, issueCalls, sentInvites };
  }

  function buildService(fake: ReturnType<typeof buildFake>) {
    return new UsersService(
      fake.prisma as never,
      new PasswordService(),
      fake.auditLog as never,
      fake.authTokens as never,
      fake.email as never,
      fake.config as never,
    );
  }

  test("criar usuário: nasce sem senha (passwordHash null) e um convite é enviado por e-mail", async () => {
    const fake = buildFake({ id: "u1", name: "Novo Usuário", role: "LIDERANCA", active: true, analystId: null });
    const service = buildService(fake);

    await service.create({ name: "Novo Usuário", email: "novo@teste.local", role: "LIDERANCA" }, "performer-1");

    expect(fake.createCalls[0].passwordHash).toBeNull();
    expect(fake.issueCalls).toEqual([{ userId: "new-user-id", type: "INVITE" }]);
    expect(fake.sentInvites).toHaveLength(1);
    expect(fake.sentInvites[0].to).toBe("novo@teste.local");
    expect(fake.sentInvites[0].link).toContain("/definir-senha/fake-token");
  });

  test("criar usuário: falha no envio do e-mail não derruba a criação da conta", async () => {
    const fake = buildFake({ id: "u1", name: "Novo Usuário", role: "LIDERANCA", active: true, analystId: null });
    fake.email.sendInviteEmail.mockRejectedValueOnce(new Error("Resend fora do ar"));
    const service = buildService(fake);

    const result = await service.create(
      { name: "Novo Usuário", email: "novo@teste.local", role: "LIDERANCA" },
      "performer-1",
    );

    expect(result).toBeDefined();
    expect(fake.createCalls).toHaveLength(1);
  });

  test("reenviar convite: invalida o token anterior e emite um novo (via authTokens.issue, que já invalida sozinho)", async () => {
    const fake = buildFake({ id: "u1", name: "Convidado", role: "LIDERANCA", active: true, analystId: null, passwordHash: null });
    const service = buildService(fake);

    await service.resendInvite("u1");

    expect(fake.issueCalls).toEqual([{ userId: "u1", type: "INVITE" }]);
    expect(fake.sentInvites).toHaveLength(1);
  });

  test("reenviar convite: rejeita se a conta já confirmou o e-mail (já tem senha)", async () => {
    const fake = buildFake({
      id: "u1",
      name: "Já confirmado",
      role: "LIDERANCA",
      active: true,
      analystId: null,
      passwordHash: "$argon2id$já-tem-senha",
    });
    const service = buildService(fake);

    await expect(service.resendInvite("u1")).rejects.toThrow();
    expect(fake.issueCalls).toHaveLength(0);
  });

  test("com 'password' informado: hash real é calculado e gravado como passwordHash", async () => {
    const fake = buildFake({
      id: "u1",
      name: "Admin",
      role: "ADMINISTRADOR",
      active: true,
      analystId: null,
      emailConfirmedAt: new Date("2026-01-01"),
    });
    const service = buildService(fake);

    await service.update("u1", { password: "nova-senha-forte" }, "performer-1");

    expect(fake.updateCalls[0].passwordHash).toBeDefined();
    expect(fake.updateCalls[0].passwordHash).not.toBe("nova-senha-forte");
    // hash argon2 real, não um valor fixo/placeholder.
    expect(fake.updateCalls[0].passwordHash).toMatch(/^\$argon2/);
  });

  test("sem 'password' (campo ausente): passwordHash não é tocado", async () => {
    const fake = buildFake({ id: "u1", name: "Admin", role: "ADMINISTRADOR", active: true, analystId: null });
    const service = buildService(fake);

    await service.update("u1", { name: "Admin Renomeado" }, "performer-1");

    expect(fake.updateCalls[0]).not.toHaveProperty("passwordHash");
  });

  test("audit log nunca recebe o hash da senha em texto (só a flag passwordChanged)", async () => {
    const fake = buildFake({ id: "u1", name: "Admin", role: "ADMINISTRADOR", active: true, analystId: null });
    const service = buildService(fake);

    await service.update("u1", { password: "nova-senha-forte" }, "performer-1");

    const recorded = fake.auditCalls[0];
    expect(recorded.after).not.toHaveProperty("passwordHash");
    expect(recorded.after.passwordChanged).toBe(true);
  });

  test("admin define senha manualmente numa conta ainda não confirmada: carimba emailConfirmedAt também", async () => {
    const fake = buildFake({
      id: "u1",
      name: "Convidado que perdeu o e-mail",
      role: "LIDERANCA",
      active: true,
      analystId: null,
      passwordHash: null,
      emailConfirmedAt: null,
    });
    const service = buildService(fake);

    await service.update("u1", { password: "nova-senha-forte" }, "performer-1");

    expect(fake.updateCalls[0].emailConfirmedAt).toBeInstanceOf(Date);
  });

  test("admin define senha manualmente numa conta JÁ confirmada: não sobrescreve emailConfirmedAt", async () => {
    const already = new Date("2026-01-01");
    const fake = buildFake({
      id: "u1",
      name: "Admin",
      role: "ADMINISTRADOR",
      active: true,
      analystId: null,
      emailConfirmedAt: already,
    });
    const service = buildService(fake);

    await service.update("u1", { password: "nova-senha-forte" }, "performer-1");

    expect(fake.updateCalls[0]).not.toHaveProperty("emailConfirmedAt");
  });
});
