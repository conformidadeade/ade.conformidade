import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { AnalystsService } from "./analysts.service";
import { CreateAnalystDto, InactivateDto, UpdateAnalystDto } from "./dto/catalog-entry.dto";

@ApiTags("analysts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("analysts")
export class AnalystsController {
  constructor(private readonly analystsService: AnalystsService) {}

  @Get()
  list(@Query("includeInactive") includeInactive?: string) {
    return this.analystsService.list(includeInactive === "true");
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post()
  create(@Body() dto: CreateAnalystDto, @CurrentUser() user: AuthenticatedUser) {
    return this.analystsService.create(dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAnalystDto, @CurrentUser() user: AuthenticatedUser) {
    return this.analystsService.update(id, dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post(":id/inactivate")
  inactivate(@Param("id", ParseUUIDPipe) id: string, @Body() dto: InactivateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.analystsService.inactivate(id, dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post(":id/activate")
  activate(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.analystsService.activate(id, user.id);
  }
}
