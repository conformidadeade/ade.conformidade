import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { CreateCatalogEntryDto, InactivateDto, UpdateCatalogEntryDto } from "./dto/catalog-entry.dto";
import { MediaChannelsService } from "./media-channels.service";

@ApiTags("media-channels")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("media-channels")
export class MediaChannelsController {
  constructor(private readonly mediaChannelsService: MediaChannelsService) {}

  @Get()
  list(@Query("includeInactive") includeInactive?: string) {
    return this.mediaChannelsService.list(includeInactive === "true");
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post()
  create(@Body() dto: CreateCatalogEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaChannelsService.create(dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaChannelsService.update(id, dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post(":id/inactivate")
  inactivate(@Param("id", ParseUUIDPipe) id: string, @Body() dto: InactivateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaChannelsService.inactivate(id, dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post(":id/activate")
  activate(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaChannelsService.activate(id, user.id);
  }
}
