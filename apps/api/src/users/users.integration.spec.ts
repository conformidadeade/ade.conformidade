import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * Rate limiting em POST /users/:id/resend-invite (adendo "Confirmação de
 * e-mail e recuperação de senha", item 3 — o outro dos dois endpoints
 * citados explicitamente, ao lado de forgot-password). Guards de
 * autenticação/role sobrepostos (já cobertos por outros testes) para
 * isolar só o comportamento do ThrottlerGuard local desta rota.
 */
describe("Rate limiting: POST /users/:id/resend-invite (integração)", () => {
  let app: INestApplication;
  const ADMIN_USER: AuthenticatedUser = { id: "u-admin", role: "ADMINISTRADOR", analystId: null };
  const fakeUsersService = { resendInvite: jest.fn(async () => undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: fakeUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = ADMIN_USER;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test("permite até o limite (5 em 60s) e bloqueia (429) a partir da 6ª tentativa", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post(`/users/${id}/resend-invite`).expect(204);
    }
    await request(app.getHttpServer()).post(`/users/${id}/resend-invite`).expect(429);
  });
});
