import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CombinationsModule } from "./combinations/combinations.module";
import { CommonModule } from "./common/common.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GuidelinesModule } from "./guidelines/guidelines.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReleaseModule } from "./release/release.module";
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
  ],
})
export class AppModule {}
