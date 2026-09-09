import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { CsrfGuard } from "./auth/guards/csrf.guard";
import { CatalogModule } from "./catalog/catalog.module";
import { CombinationsModule } from "./combinations/combinations.module";
import { CommonModule } from "./common/common.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GuidelinesModule } from "./guidelines/guidelines.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReleaseModule } from "./release/release.module";
import { SkillsModule } from "./skills/skills.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global só para registro no DI — NÃO aplicado a toda rota (não é
    // APP_GUARD). Adendo "Confirmação de e-mail e recuperação de senha",
    // item 3: rate limiting só nos dois endpoints públicos sensíveis
    // (forgot-password, resend-invite), via @UseGuards(ThrottlerGuard)
    // local em cada um — não globalmente, para não afetar rotas pesadas
    // já existentes (ex.: importação de planilha).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    GuidelinesModule,
    CombinationsModule,
    DashboardModule,
    ReleaseModule,
    SkillsModule,
  ],
  providers: [
    // Global (adendo "Segurança de sessão", item 2) — protege toda rota
    // mutante (POST/PUT/PATCH/DELETE) de qualquer controller automaticamente.
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
