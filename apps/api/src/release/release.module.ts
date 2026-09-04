import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaReleaseUnitOfWork } from "./prisma-release.repository";
import { RELEASE_UOW } from "./release-repository.port";
import { ReleaseController } from "./release.controller";
import { ReleaseService } from "./release.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ReleaseController],
  providers: [ReleaseService, { provide: RELEASE_UOW, useClass: PrismaReleaseUnitOfWork }],
  exports: [ReleaseService],
})
export class ReleaseModule {}
