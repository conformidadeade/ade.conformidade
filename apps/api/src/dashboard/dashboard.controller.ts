import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ReturnOrigin } from "@reanalise-erp/types";
import { scopeAnalystId } from "../auth/analyst-scope";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { DashboardService } from "./dashboard.service";

const ORIGINS: ReturnOrigin[] = ["REANALISE", "CLIENTE"];

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Um ANALISTA só vê os próprios indicadores (adendo "Acesso restrito",
   * item 1). Adendo "Dashboard: mostrar totais de todos os períodos" —
   * sem parâmetro de mês/ano: os indicadores são sempre o total acumulado.
   */
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query("analystId") analystId?: string,
    @Query("clientId") clientId?: string,
    @Query("mediaChannelId") mediaChannelId?: string,
    @Query("origin") origin?: string,
  ) {
    return this.dashboardService.getIndicators({
      analystId: scopeAnalystId(user, analystId),
      clientId,
      mediaChannelId,
      origin: ORIGINS.includes(origin as ReturnOrigin) ? (origin as ReturnOrigin) : undefined,
    });
  }
}
