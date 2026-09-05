import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  get(
    @Query("month") month?: string,
    @Query("year") year?: string,
    @Query("analystId") analystId?: string,
    @Query("clientId") clientId?: string,
    @Query("mediaChannelId") mediaChannelId?: string,
  ) {
    return this.dashboardService.getIndicators(month ? Number(month) : undefined, year ? Number(year) : undefined, {
      analystId,
      clientId,
      mediaChannelId,
    });
  }
}
