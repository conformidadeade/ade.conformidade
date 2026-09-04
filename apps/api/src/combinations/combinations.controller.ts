import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CombinationsService } from "./combinations.service";
import { ListCombinationsQuery } from "./dto/list-combinations.query";

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
}
