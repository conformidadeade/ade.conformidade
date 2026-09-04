import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AnalystsController } from "./analysts.controller";
import { AnalystsService } from "./analysts.service";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { MediaChannelsController } from "./media-channels.controller";
import { MediaChannelsService } from "./media-channels.service";

@Module({
  imports: [AuthModule],
  controllers: [ClientsController, MediaChannelsController, AnalystsController],
  providers: [ClientsService, MediaChannelsService, AnalystsService],
  exports: [ClientsService, MediaChannelsService, AnalystsService],
})
export class CatalogModule {}
