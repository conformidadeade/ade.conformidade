import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { writeSimpleExcel } from "../common/excel-export";
import { writeSimpleTablePdf } from "../common/pdf-export";
import { CreateSkillEvidenceDto } from "./dto/create-skill-evidence.dto";
import { ListSkillsQuery } from "./dto/list-skills.query";
import { SkillsImportErrorFilter } from "./skills-import-error.filter";
import { SkillsService } from "./skills.service";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

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

  /** Exportações (adendo Fase 2, item 4) — sempre a base completa, restrito a LIDERANCA/ADMINISTRADOR. */
  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Get("export.xlsx")
  async exportXlsx(@Res() res: Response) {
    const rows = await this.skillsService.getMap({});
    await writeSimpleExcel(res, {
      filename: "mapa-habilidades.xlsx",
      sheetName: "Mapa de Habilidades",
      columns: [
        { header: "Analista", key: "analystName", width: 24 },
        { header: "Cliente", key: "clientName", width: 20 },
        { header: "Meio", key: "mediaChannelName", width: 16 },
        { header: "Evidências", key: "evidenceCount", width: 12 },
        { header: "Primeira evidência", key: "firstEvidenceAtLabel", width: 18 },
      ],
      rows: rows.map((r) => ({ ...r, firstEvidenceAtLabel: fmtDate(r.firstEvidenceAt) })),
    });
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Get("export.pdf")
  async exportPdf(@Res() res: Response) {
    const rows = await this.skillsService.getMap({});
    writeSimpleTablePdf(res, {
      title: "Mapa de Habilidades",
      filename: "mapa-habilidades.pdf",
      columns: [
        { header: "Analista", width: 140 },
        { header: "Cliente", width: 120 },
        { header: "Meio", width: 100 },
        { header: "Evidências", width: 80 },
        { header: "Primeira evidência", width: 100 },
      ],
      rows: rows.map((r) => [r.analystName, r.clientName, r.mediaChannelName, String(r.evidenceCount), fmtDate(r.firstEvidenceAt)]),
    });
  }
}
