import { Controller, INestApplication, Post, UseGuards } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaService } from "../prisma/prisma.service";
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
    },
  ];
  const refreshTokens: { id: string; userId: string; tokenHash: string; revokedAt: Date | null; expiresAt: Date }[] =
    [];

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
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const r of refreshTokens) {
          if (r.tokenHash === where.tokenHash && r.revokedAt === null) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      }),
    },
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
      ],
      controllers: [AuthController, TestMutateController],
      providers: [
        AuthService,
        PasswordService,
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
});
