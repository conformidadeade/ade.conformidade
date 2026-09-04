import { Body, Controller, Post, UseFilters } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ManualActionDto } from "./dto/manual-action.dto";
import { RegisterProcessDto } from "./dto/register-process.dto";
import { RegisterReturnDto } from "./dto/register-return.dto";
import { DomainErrorFilter } from "./domain-error.filter";
import { ReleaseService } from "./release.service";

// TODO(auth): aplicar @UseGuards(JwtAuthGuard, RolesGuard) com os papéis
// LIDERANCA/ADMINISTRADOR quando o AuthModule existir (item 21).
@ApiTags("release")
@UseFilters(DomainErrorFilter)
@Controller("release")
export class ReleaseController {
  constructor(private readonly releaseService: ReleaseService) {}

  /** Tela de Lançamento de Processos (item 14). */
  @Post("processes")
  registerProcess(@Body() dto: RegisterProcessDto) {
    return this.releaseService.registerProcess({
      ...dto,
      analysisDate: new Date(dto.analysisDate),
    });
  }

  /** Tela de Devoluções (item 15). */
  @Post("returns")
  registerReturn(@Body() dto: RegisterReturnDto) {
    return this.releaseService.registerReturn({
      ...dto,
      occurredAt: new Date(dto.occurredAt),
    });
  }

  /** Reset manual da construção vigente (item 11). */
  @Post("manual-reset")
  manualReset(@Body() dto: ManualActionDto) {
    return this.releaseService.manualReset({
      ...dto,
      occurredAt: new Date(dto.occurredAt),
    });
  }

  /** Retorno manual de uma combinação liberada (item 12). */
  @Post("manual-return")
  manualReturn(@Body() dto: ManualActionDto) {
    return this.releaseService.manualReturn({
      ...dto,
      occurredAt: new Date(dto.occurredAt),
    });
  }
}
