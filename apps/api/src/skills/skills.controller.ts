import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { CreateSkillEvidenceDto } from "./dto/create-skill-evidence.dto";
import { ListSkillsQuery } from "./dto/list-skills.query";
import { SkillsImportErrorFilter } from "./skills-import-error.filter";
import { SkillsService } from "./skills.service";

/** Mapa de Habilidades (item 6) — leitura aberta a todos os perfis (item 6.4); escrita restrita a LIDERANCA/ADMINISTRADOR. */
@ApiTags("skills")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("skills")
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  getMap(@Query() query: ListSkillsQuery) {
    return this.skillsService.getMap(query);
  }

  @Get(":id/evidences")
  getEvidences(@Param("id", ParseUUIDPipe) id: string) {
    return this.skillsService.getEvidences(id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Post()
  createManual(@Body() dto: CreateSkillEvidenceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.skillsService.createManual(dto, user.id);
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @UseFilters(SkillsImportErrorFilter)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  @Post("import")
  importSpreadsheet(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) {
    if (!file) {
      throw new BadRequestException("Nenhum arquivo enviado.");
    }
    return this.skillsService.importFromWorkbook(file.buffer, user.id);
  }
}
