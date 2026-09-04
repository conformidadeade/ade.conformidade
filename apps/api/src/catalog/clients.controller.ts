import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { ClientsService } from "./clients.service";
import { CreateCatalogEntryDto, InactivateDto, UpdateCatalogEntryDto } from "./dto/catalog-entry.dto";

@ApiTags("clients")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(@Query("includeInactive") includeInactive?: string) {
    return this.clientsService.list(includeInactive === "true");
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post()
  create(@Body() dto: CreateCatalogEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.update(id, dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post(":id/inactivate")
  inactivate(@Param("id", ParseUUIDPipe) id: string, @Body() dto: InactivateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.inactivate(id, dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post(":id/activate")
  activate(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.activate(id, user.id);
  }
}
