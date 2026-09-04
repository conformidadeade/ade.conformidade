import { ApiPropertyOptional } from "@nestjs/swagger";
import { CombinationStatus } from "@reanalise-erp/types";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

const STATUSES: CombinationStatus[] = ["EM_CONSTRUCAO", "LIBERADO", "RETORNADO"];

/** Filtros do Mapa de Liberação (item 17). "Próximos da liberação" fica de fora — adiado (ver DECISIONS.md). */
export class ListCombinationsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() mediaChannelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() analystId?: string;
  @ApiPropertyOptional({ enum: STATUSES }) @IsOptional() @IsIn(STATUSES) status?: CombinationStatus;

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
