import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { SetGuidelineDto } from "./dto/set-guideline.dto";
import { GuidelinesService } from "./guidelines.service";

/**
 * Restrito por inteiro a LIDERANCA/ADMINISTRADOR — inclusive leitura.
 * Nenhuma das 3 telas do ANALISTA (Mapa, Mapa de Habilidades, Dashboard)
 * chama este endpoint diretamente; a diretriz que aparece no Mapa é
 * resolvida no servidor por CombinationsService (adendo "Acesso
 * restrito", item 1 — confirmação de que Diretrizes continua bloqueado).
 */
@ApiTags("guidelines")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("LIDERANCA", "ADMINISTRADOR")
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

  @Post()
  setGuideline(@Body() dto: SetGuidelineDto, @CurrentUser() user: AuthenticatedUser) {
    return this.guidelinesService.setGuideline(dto, user.id);
  }
}
