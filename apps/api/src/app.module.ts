import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { ReleaseModule } from "./release/release.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ReleaseModule],
})
export class AppModule {}
