import { Body, Controller, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/jwt-payload";
import { ManualActionDto } from "./dto/manual-action.dto";
import { RegisterProcessDto } from "./dto/register-process.dto";
import { RegisterReturnDto } from "./dto/register-return.dto";
import { DomainErrorFilter } from "./domain-error.filter";
import { ReleaseService } from "./release.service";

/** Lançamentos e ações críticas do motor de liberação — restrito a quem decide (item 21). */
@ApiTags("release")
@ApiBearerAuth()
@UseFilters(DomainErrorFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("LIDERANCA", "ADMINISTRADOR")
@Controller("release")
export class ReleaseController {
  constructor(private readonly releaseService: ReleaseService) {}

  /** Tela de Lançamento de Processos (item 14). */
  @Post("processes")
  registerProcess(@Body() dto: RegisterProcessDto, @CurrentUser() user: AuthenticatedUser) {
    return this.releaseService.registerProcess({
      ...dto,
      analysisDate: new Date(dto.analysisDate),
      recordedByUserId: user.id,
    });
  }

  /** Tela de Devoluções (item 15). */
  @Post("returns")
  registerReturn(@Body() dto: RegisterReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.releaseService.registerReturn({
      ...dto,
      occurredAt: new Date(dto.occurredAt),
      registeredByUserId: user.id,
    });
  }

  /** Reset manual da construção vigente (item 11). */
  @Post("manual-reset")
  manualReset(@Body() dto: ManualActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.releaseService.manualReset({
      ...dto,
      occurredAt: new Date(dto.occurredAt),
      performedByUserId: user.id,
    });
  }

  /** Retorno manual de uma combinação liberada (item 12). */
  @Post("manual-return")
  manualReturn(@Body() dto: ManualActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.releaseService.manualReturn({
      ...dto,
      occurredAt: new Date(dto.occurredAt),
      performedByUserId: user.id,
    });
  }
}
