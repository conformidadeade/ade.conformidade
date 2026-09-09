import { Controller, INestApplication, Post, UseGuards } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import cookieParser from "cookie-parser";
import request from "supertest";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthTokenService } from "./auth-token.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CsrfGuard } from "./guards/csrf.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PasswordService } from "./password.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

/**
 * Rota mutante de teste, protegida só por JwtAuthGuard — existe apenas
 * para exercitar o CsrfGuard (global) contra uma rota autenticada de
 * verdade, já que as rotas do próprio AuthController (login/refresh/
 * logout) são as únicas sem guarda de autenticação neste módulo.
 */
@Controller("test-mutate")
class TestMutateController {
  @Post()
  @UseGuards(JwtAuthGuard)
  mutate() {
    return { ok: true };
  }
}

/**
 * Teste de INTEGRAÇÃO real (HTTP + cookies de verdade via supertest, sem
 * overrideGuard) do adendo "Segurança de sessão: migrar de localStorage
 * para cookie httpOnly + CSRF" (08/09/2026) — é o único jeito de provar
 * que os cookies saem com os atributos certos e que o CsrfGuard global
 * realmente intercepta requisições reais, não só a lógica isolada do guard.
 */
describe("Sessão via cookie httpOnly + CSRF (integração)", () => {
  let app: INestApplication;
  let authTokenService: AuthTokenService;
  const passwords = new PasswordService();

  const PLAIN_PASSWORD = "senha-de-teste-123";
  let passwordHash: string;

  const users = [
    {
      id: "u1",
      name: "Admin de Teste",
      email: "admin@teste.local",
      passwordHash: "",
      role: "ADMINISTRADOR",
      active: true,
      analystId: null,
      lastLoginAt: null as Date | null,
      emailConfirmedAt: new Date("2026-01-01") as Date | null,
    },
    {
      id: "u2",
      name: "Convidado Pendente",
      email: "convidado@teste.local",
      passwordHash: null as string | null,
      role: "LIDERANCA",
      active: true,
      analystId: null,
      lastLoginAt: null as Date | null,
      emailConfirmedAt: null as Date | null,
    },
  ];
  const refreshTokens: { id: string; userId: string; tokenHash: string; revokedAt: Date | null; expiresAt: Date }[] =
    [];
  const authTokens: {
    id: string;
    userId: string;
    type: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  }[] = [];

  const fakePrisma = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id || u.email === where.email) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `rt-${refreshTokens.length + 1}`, revokedAt: null, ...data };
        refreshTokens.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          refreshTokens.find(
            (r) => r.tokenHash === where.tokenHash && r.revokedAt === null && r.expiresAt > new Date(),
          ) ?? null
        );
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const r = refreshTokens.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
      // Usado tanto por logout (filtra por tokenHash) quanto por
      // resetPassword (filtra por userId, revogando TODAS as sessões
      // ativas — adendo "Confirmação de e-mail...", item 2).
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const r of refreshTokens) {
          if (where.revokedAt === null && r.revokedAt !== null) continue;
          if (where.tokenHash !== undefined && r.tokenHash !== where.tokenHash) continue;
          if (where.userId !== undefined && r.userId !== where.userId) continue;
          Object.assign(r, data);
          count++;
        }
        return { count };
      }),
    },
    authToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `at-${authTokens.length + 1}`, usedAt: null, ...data };
        authTokens.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const t of authTokens) {
          if (t.userId === where.userId && t.type === where.type && t.usedAt === where.usedAt) {
            Object.assign(t, data);
            count++;
          }
        }
        return { count };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          authTokens.find(
            (t) =>
              t.tokenHash === where.tokenHash &&
              t.type === where.type &&
              t.usedAt === where.usedAt &&
              t.expiresAt > new Date(),
          ) ?? null
        );
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const t = authTokens.find((x) => x.id === where.id)!;
        Object.assign(t, data);
        return t;
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  /** Espião de e-mail — substitui o EmailService real para não bater na rede e permitir assert de "foi enviado". */
  const emailSpy = {
    sendInviteEmail: jest.fn(async (_to: string, _name: string, _link: string) => undefined),
    sendPasswordResetEmail: jest.fn(async (_to: string, _name: string, _link: string) => undefined),
  };

  beforeAll(async () => {
    passwordHash = await passwords.hash(PLAIN_PASSWORD);
    users[0].passwordHash = passwordHash;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: "test-secret",
              JWT_ACCESS_TTL: "15m",
              COOKIE_SECURE: "false",
            }),
          ],
        }),
        PassportModule,
        JwtModule.register({}),
        // Rate limiting real (adendo "Confirmação de e-mail e recuperação
        // de senha", item 3) — mesma config do AppModule, para o teste de
        // throttling em forgot-password exercitar o guard de verdade.
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
      ],
      controllers: [AuthController, TestMutateController],
      providers: [
        AuthService,
        PasswordService,
        AuthTokenService,
        { provide: EmailService, useValue: emailSpy },
        JwtStrategy,
        JwtAuthGuard,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    authTokenService = moduleRef.get(AuthTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  function getCookie(res: request.Response, name: string): string | undefined {
    const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
    const line = raw?.find((c) => c.startsWith(`${name}=`));
    return line?.split(";")[0]?.split("=")[1];
  }

  test("login: nenhum token no corpo da resposta, só { user } — tokens saem como cookie httpOnly", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: PLAIN_PASSWORD })
      .expect(200);

    expect(res.body).toEqual({ user: expect.objectContaining({ email: "admin@teste.local" }) });
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();

    const setCookies = res.headers["set-cookie"] as unknown as string[];
    const accessCookie = setCookies.find((c) => c.startsWith("access_token="));
    const refreshCookie = setCookies.find((c) => c.startsWith("refresh_token="));
    const csrfCookie = setCookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/HttpOnly/i);
    // /auth (não /api/auth) — sem proxy, o navegador chama a rota real do
    // backend diretamente (adendo "Deploy em produção", revisado 09/09/2026).
    expect(refreshCookie).toMatch(/Path=\/auth/i);
    // CSRF cookie é DELIBERADAMENTE legível por JS (não HttpOnly) — é a metade "conhecida pelo cliente" do double-submit.
    expect(csrfCookie).not.toMatch(/HttpOnly/i);
  });

  test("rota mutante autenticada SEM o header X-CSRF-Token é rejeitada (403), mesmo com cookie de sessão válido", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: PLAIN_PASSWORD });
    const accessToken = getCookie(login, "access_token");
    // Um navegador de verdade manda os dois cookies automaticamente (foram
    // gravados juntos no login) — o que falta aqui de propósito é só o
    // header, que só o próprio app legítimo sabe montar a partir do
    // cookie legível (é exatamente o que o CsrfGuard checa).
    const csrfCookie = getCookie(login, CSRF_COOKIE_NAME);

    await request(app.getHttpServer())
      .post("/test-mutate")
      .set("Cookie", [`access_token=${accessToken}`, `${CSRF_COOKIE_NAME}=${csrfCookie}`])
      .expect(403);
  });

  test("rota mutante autenticada COM o header X-CSRF-Token correto é aceita", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: PLAIN_PASSWORD });
    const accessToken = getCookie(login, "access_token");
    const csrfToken = getCookie(login, CSRF_COOKIE_NAME);

    await request(app.getHttpServer())
      .post("/test-mutate")
      .set("Cookie", [`access_token=${accessToken}`, `${CSRF_COOKIE_NAME}=${csrfToken}`])
      .set(CSRF_HEADER_NAME, csrfToken!)
      .expect(201);
  });

  test("refresh: usa o refresh_token do cookie (não do corpo), rotaciona e devolve novos cookies", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: PLAIN_PASSWORD });
    const refreshToken = getCookie(login, "refresh_token");

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`])
      .expect(200);

    expect(refreshed.body).toEqual({ user: expect.objectContaining({ email: "admin@teste.local" }) });
    const newRefreshToken = getCookie(refreshed, "refresh_token");
    expect(newRefreshToken).toBeDefined();
    expect(newRefreshToken).not.toBe(refreshToken); // rotação — nunca reemite o mesmo valor.
  });

  test("refresh sem cookie nenhum é rejeitado (401)", async () => {
    await request(app.getHttpServer()).post("/auth/refresh").expect(401);
  });

  test("logout limpa os cookies e o refresh token antigo deixa de autenticar (não é possível reaproveitá-lo)", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: PLAIN_PASSWORD });
    const refreshToken = getCookie(login, "refresh_token");

    const logoutRes = await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", [`refresh_token=${refreshToken}`])
      .expect(204);

    const setCookies = logoutRes.headers["set-cookie"] as unknown as string[];
    // clearCookie reenvia o cookie com data de expiração no passado.
    expect(setCookies.some((c) => c.startsWith("access_token=") && /Expires=/i.test(c))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("refresh_token=") && /Expires=/i.test(c))).toBe(true);

    // O MESMO refresh token usado no logout não autentica mais um novo refresh.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${refreshToken}`])
      .expect(401);
  });

  test("login de conta convidada (sem senha ainda) é bloqueado com mensagem distinta de 'credenciais inválidas'", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "convidado@teste.local", password: "qualquer-coisa" })
      .expect(401);

    expect(res.body.message).toMatch(/não confirmada/i);
  });

  test("confirm-invite: token válido define a senha, confirma o e-mail, e permite login em seguida — token não pode ser reaproveitado", async () => {
    const token = await authTokenService.issue("u2", "INVITE");

    await request(app.getHttpServer())
      .post("/auth/confirm-invite")
      .send({ token, password: "senha-nova-do-convidado" })
      .expect(204);

    const loginOk = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "convidado@teste.local", password: "senha-nova-do-convidado" })
      .expect(200);
    expect(loginOk.body.user.email).toBe("convidado@teste.local");

    // Reusar o mesmo token de convite não funciona mais.
    await request(app.getHttpServer())
      .post("/auth/confirm-invite")
      .send({ token, password: "outra-senha-qualquer" })
      .expect(401);
  });

  test("confirm-invite: token expirado ou inexistente dá erro claro e não altera nada", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/confirm-invite")
      .send({ token: "token-que-nunca-existiu", password: "senha-nova-do-convidado" })
      .expect(401);

    expect(res.body.message).toMatch(/inválido ou expirado/i);
  });

  test("forgot-password: e-mail existente e confirmado — resposta genérica 204 e um e-mail de recuperação é 'enviado'", async () => {
    emailSpy.sendPasswordResetEmail.mockClear();

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "admin@teste.local" })
      .expect(204);

    expect(emailSpy.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(emailSpy.sendPasswordResetEmail.mock.calls[0][0]).toBe("admin@teste.local");
  });

  test("forgot-password: e-mail inexistente — MESMA resposta genérica 204, e nenhum e-mail é enviado de verdade (só observável no teste, nunca na resposta)", async () => {
    emailSpy.sendPasswordResetEmail.mockClear();

    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "nao-existe-no-sistema@teste.local" })
      .expect(204);

    expect(res.body).toEqual({});
    expect(emailSpy.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test("reset-password: token válido troca a senha e revoga TODAS as sessões ativas do usuário", async () => {
    // Sessão ativa antes do reset.
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: PLAIN_PASSWORD });
    const oldRefreshToken = getCookie(login, "refresh_token");

    const resetToken = await authTokenService.issue("u1", "PASSWORD_RESET");
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: resetToken, password: "senha-pos-reset-123" })
      .expect(204);

    // O refresh token emitido ANTES do reset não serve mais.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", [`refresh_token=${oldRefreshToken}`])
      .expect(401);

    // A senha nova já vale.
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@teste.local", password: "senha-pos-reset-123" })
      .expect(200);

    // Restaura a senha original para não vazar estado entre testes deste describe.
    users[0].passwordHash = await passwords.hash(PLAIN_PASSWORD);
  });
});

/**
 * Rate limiting em forgot-password (item 3 do adendo "Confirmação de
 * e-mail e recuperação de senha" — implementado agora, não só sinalizado).
 * Suíte isolada com sua PRÓPRIA instância de app/ThrottlerStorage: o
 * ThrottlerGuard padrão rastreia por IP da requisição, que seria o mesmo
 * (127.0.0.1, via supertest) para todos os testes já feitos acima nesse
 * mesmo endpoint — reaproveitar o app de cima contaminaria a contagem.
 */
describe("Rate limiting: POST /auth/forgot-password", () => {
  let app: INestApplication;
  const passwords = new PasswordService();
  const user = {
    id: "ru1",
    name: "Usuário Rate Limit",
    email: "ratelimit@teste.local",
    passwordHash: "hash-qualquer",
    role: "ADMINISTRADOR",
    active: true,
    analystId: null,
    lastLoginAt: null as Date | null,
    emailConfirmedAt: new Date("2026-01-01") as Date | null,
  };
  const authTokens: { id: string; userId: string; type: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }[] = [];
  const emailSpy = {
    sendInviteEmail: jest.fn(async (_to: string, _name: string, _link: string) => undefined),
    sendPasswordResetEmail: jest.fn(async (_to: string, _name: string, _link: string) => undefined),
  };

  const fakePrisma = {
    user: { findUnique: jest.fn(async () => user), update: jest.fn(async () => user) },
    refreshToken: { updateMany: jest.fn(async () => ({ count: 0 })) },
    authToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `at-${authTokens.length + 1}`, usedAt: null, ...data };
        authTokens.push(row);
        return row;
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: "test-secret", JWT_ACCESS_TTL: "15m", COOKIE_SECURE: "false" })],
        }),
        PassportModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        PasswordService,
        AuthTokenService,
        { provide: EmailService, useValue: emailSpy },
        JwtStrategy,
        JwtAuthGuard,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("permite até o limite (5 em 60s) e bloqueia (429) a partir da 6ª tentativa", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post("/auth/forgot-password").send({ email: user.email }).expect(204);
    }
    await request(app.getHttpServer()).post("/auth/forgot-password").send({ email: user.email }).expect(429);
  });
});
