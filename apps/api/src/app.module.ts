import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
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
