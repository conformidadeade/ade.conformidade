import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class SetGuidelineDto {
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;

  @ApiProperty({ description: "Quantidade de processos corretos necessária para liberação (item 4)." })
  @IsInt()
  @Min(1)
  targetCount!: number;

  @ApiProperty({
    required: false,
    default: 2,
    description: "Nº de devoluções no mês que faz um LIBERADO retornar à reanálise (item 19).",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  returnLimit?: number;

  @ApiProperty({ required: false, description: "Motivo da alteração — obrigatório quando já existe diretriz vigente." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
