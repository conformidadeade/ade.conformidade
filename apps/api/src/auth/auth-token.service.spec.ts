import { AuthTokenService } from "./auth-token.service";
import { PasswordService } from "./password.service";

/**
 * Cobertura de AuthTokenService — tokens opacos de convite/recuperação de
 * senha (adendo "Confirmação de e-mail e recuperação de senha",
 * 09/09/2026), itens 6 e 7 do pedido de testes: token expirado/já usado
 * dá erro claro sem alterar dados, e reemitir invalida o anterior.
 */
describe("AuthTokenService", () => {
  function buildFake() {
    const rows: { id: string; userId: string; type: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }[] = [];
    let seq = 0;
    const prisma = {
      authToken: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `at-${++seq}`, usedAt: null, ...data };
          rows.push(row);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const r of rows) {
            if (r.userId === where.userId && r.type === where.type && r.usedAt === where.usedAt) {
              Object.assign(r, data);
              count++;
            }
          }
          return { count };
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          return (
            rows.find(
              (r) =>
                r.tokenHash === where.tokenHash &&
                r.type === where.type &&
                r.usedAt === where.usedAt &&
                r.expiresAt > new Date(),
            ) ?? null
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const r = rows.find((x) => x.id === where.id)!;
          Object.assign(r, data);
          return r;
        }),
      },
    };
    return { prisma, rows };
  }

  function buildService(fake: ReturnType<typeof buildFake>) {
    return new AuthTokenService(fake.prisma as never, new PasswordService());
  }

  test("issue + consume: o token em texto plano emitido consome com sucesso e retorna o userId", async () => {
    const fake = buildFake();
    const service = buildService(fake);

    const token = await service.issue("u1", "INVITE");
    const result = await service.consume(token, "INVITE");

    expect(result).toEqual({ userId: "u1" });
    // O hash gravado nunca é o token em texto puro.
    expect(fake.rows[0].tokenHash).not.toBe(token);
  });

  test("token já consumido não pode ser reaproveitado (segundo consume falha)", async () => {
    const fake = buildFake();
    const service = buildService(fake);

    const token = await service.issue("u1", "INVITE");
    const first = await service.consume(token, "INVITE");
    const second = await service.consume(token, "INVITE");

    expect(first).toEqual({ userId: "u1" });
    expect(second).toBeNull();
  });

  test("token expirado não é consumido (retorna null, sem alterar dados)", async () => {
    const fake = buildFake();
    const service = buildService(fake);

    const token = await service.issue("u1", "INVITE");
    fake.rows[0].expiresAt = new Date(Date.now() - 1000); // força expiração

    const result = await service.consume(token, "INVITE");

    expect(result).toBeNull();
    // Não marcou usedAt — não "gastou" um token que nem foi aceito.
    expect(fake.rows[0].usedAt).toBeNull();
  });

  test("token de tipo errado não é aceito (INVITE não serve para PASSWORD_RESET)", async () => {
    const fake = buildFake();
    const service = buildService(fake);

    const token = await service.issue("u1", "INVITE");
    const result = await service.consume(token, "PASSWORD_RESET");

    expect(result).toBeNull();
  });

  test("reemitir (issue) invalida qualquer token pendente anterior do mesmo tipo — o antigo some, só o novo funciona", async () => {
    const fake = buildFake();
    const service = buildService(fake);

    const oldToken = await service.issue("u1", "INVITE");
    const newToken = await service.issue("u1", "INVITE");

    const oldResult = await service.consume(oldToken, "INVITE");
    const newResult = await service.consume(newToken, "INVITE");

    expect(oldResult).toBeNull();
    expect(newResult).toEqual({ userId: "u1" });
  });
});
