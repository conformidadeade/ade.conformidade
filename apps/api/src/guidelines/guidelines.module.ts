import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GuidelinesController } from "./guidelines.controller";
import { GuidelinesService } from "./guidelines.service";

@Module({
  imports: [AuthModule],
  controllers: [GuidelinesController],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
