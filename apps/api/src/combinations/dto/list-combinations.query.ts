import { ApiPropertyOptional } from "@nestjs/swagger";
import { CombinationStatus, ReturnOrigin } from "@reanalise-erp/types";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

const STATUSES: CombinationStatus[] = ["EM_CONSTRUCAO", "LIBERADO", "RETORNADO"];
const ORIGINS: ReturnOrigin[] = ["REANALISE", "CLIENTE"];

/** Filtros do Mapa de Liberação (item 17). "Próximos da liberação" fica de fora — adiado (ver DECISIONS.md). */
export class ListCombinationsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() mediaChannelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() analystId?: string;
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: CombinationStatus;

  /** Adendo "Origem da devolução" — mostra só combinações com ao menos 1
   * devolução dessa origem dentro do mesmo mês/ano usado para "devoluções
   * no mês" (mesma janela, confirmado com a liderança em 08/09/2026). */
  @ApiPropertyOptional({ enum: ORIGINS }) @IsOptional() @IsIn(ORIGINS) origin?: ReturnOrigin;

  @ApiPropertyOptional({ description: "1-12 — usado para o campo 'devoluções no mês'. Padrão: mês atual." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ description: "Usado para o campo 'devoluções no mês'. Padrão: ano atual." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}
