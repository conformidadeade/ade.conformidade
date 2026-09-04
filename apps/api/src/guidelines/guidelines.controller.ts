import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { SetGuidelineDto } from "./dto/set-guideline.dto";
import { GuidelinesService } from "./guidelines.service";

@ApiTags("guidelines")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("guidelines")
export class GuidelinesController {
  constructor(private readonly guidelinesService: GuidelinesService) {}

  @Get()
  listActive() {
    return this.guidelinesService.listActive();
  }

  @Get("history")
  history(@Query("clientId") clientId: string, @Query("mediaChannelId") mediaChannelId: string) {
    return this.guidelinesService.history(clientId, mediaChannelId);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post()
  setGuideline(@Body() dto: SetGuidelineDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guidelinesService.setGuideline(dto, user.id);
  }
}
