import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CombinationsController } from "./combinations.controller";
import { CombinationsService } from "./combinations.service";

@Module({
  imports: [AuthModule],
  controllers: [CombinationsController],
  providers: [CombinationsService],
})
export class CombinationsModule {}
