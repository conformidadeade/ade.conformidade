import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { writeSimpleExcel } from "../common/excel-export";
import { writeSimpleTablePdf } from "../common/pdf-export";
import { CombinationsService } from "./combinations.service";
import { ListCombinationsQuery } from "./dto/list-combinations.query";

const STATUS_LABEL: Record<string, string> = {
  EM_CONSTRUCAO: "Em construção",
  LIBERADO: "Liberado",
  RETORNADO: "Retornado à reanálise",
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

@ApiTags("combinations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("combinations")
export class CombinationsController {
  constructor(private readonly combinationsService: CombinationsService) {}

  /** Mapa de Liberação de Reanálise (item 16) — leitura aberta a todos os perfis autenticados (item 21). */
  @Get()
  getMap(@Query() query: ListCombinationsQuery) {
    return this.combinationsService.getMap(query);
  }

  /** Drill-down de PIs do ciclo atual (adendo Fase 2, item 5) — somente leitura. */
  @Get(":id/current-cycle")
  getCurrentCycle(@Param("id", ParseUUIDPipe) id: string) {
    return this.combinationsService.getCurrentCycleProcesses(id);
  }

  /**
   * Exportações (adendo Fase 2, item 4) — sempre a base completa,
   * ignorando qualquer filtro ativo na tela; restrito a LIDERANCA/
   * ADMINISTRADOR mesmo a tela de origem sendo de leitura geral.
   */
  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Get("export.xlsx")
  async exportXlsx(@Res() res: Response) {
    const rows = await this.combinationsService.getMap({});
    await writeSimpleExcel(res, {
      filename: "mapa-liberacao.xlsx",
      sheetName: "Mapa de Liberação",
      columns: [
        { header: "Analista", key: "analystName", width: 24 },
        { header: "Cliente", key: "clientName", width: 20 },
        { header: "Meio", key: "mediaChannelName", width: 16 },
        { header: "Status", key: "statusLabel", width: 20 },
        { header: "Diretriz", key: "guidelineTarget", width: 10 },
        { header: "Construção", key: "constructionCount", width: 12 },
        { header: "Faltantes", key: "missingCount", width: 10 },
        { header: "Devoluções no mês", key: "monthlyReturnCount", width: 16 },
        { header: "Última movimentação", key: "lastMovementAtLabel", width: 18 },
        { header: "Data da liberação", key: "releasedAtLabel", width: 18 },
        { header: "Data do último retorno", key: "lastReturnAtLabel", width: 20 },
        { header: "Motivo do último retorno", key: "lastReturnReason", width: 32 },
      ],
      rows: rows.map((r) => ({
        ...r,
        statusLabel: STATUS_LABEL[r.status] ?? r.status,
        lastMovementAtLabel: fmtDate(r.lastMovementAt),
        releasedAtLabel: fmtDate(r.releasedAt),
        lastReturnAtLabel: fmtDate(r.lastReturnAt),
      })),
    });
  }

  @Roles("LIDERANCA", "ADMINISTRADOR")
  @Get("export.pdf")
  async exportPdf(@Res() res: Response) {
    const rows = await this.combinationsService.getMap({});
    writeSimpleTablePdf(res, {
      title: "Mapa de Liberação de Reanálise",
      filename: "mapa-liberacao.pdf",
      columns: [
        { header: "Analista", width: 90 },
        { header: "Cliente", width: 80 },
        { header: "Meio", width: 60 },
        { header: "Status", width: 75 },
        { header: "Diretriz", width: 40 },
        { header: "Constr.", width: 40 },
        { header: "Falt.", width: 35 },
        { header: "Dev./mês", width: 45 },
        { header: "Últ. movimentação", width: 70 },
        { header: "Liberação", width: 60 },
        { header: "Últ. retorno", width: 60 },
        { header: "Motivo do retorno", width: 100 },
      ],
      rows: rows.map((r) => [
        r.analystName,
        r.clientName,
        r.mediaChannelName,
        STATUS_LABEL[r.status] ?? r.status,
        String(r.guidelineTarget),
        String(r.constructionCount),
        String(r.missingCount),
        String(r.monthlyReturnCount),
        fmtDate(r.lastMovementAt),
        fmtDate(r.releasedAt),
        fmtDate(r.lastReturnAt),
        r.lastReturnReason ?? "",
      ]),
    });
  }
}
