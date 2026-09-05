import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterProcessDto {
  @ApiProperty() @IsUUID() analystId!: string;
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;

  @ApiProperty() @IsString() @MinLength(1) piNumber!: string;
  @ApiProperty() @IsDateString() analysisDate!: string;

  /**
   * A tela de Lançamento não oferece mais esta escolha (adendo Fase 2,
   * item 2) — todo lançamento feito por ela é implicitamente correto.
   * Mantido opcional/aceito no contrato por compatibilidade (ex.: uso
   * futuro por outra tela ou correção administrativa); quando ausente, o
   * service grava CORRETO.
   */
  @ApiProperty({ enum: ["CORRETO", "INCORRETO"], required: false, default: "CORRETO" })
  @IsOptional()
  @IsIn(["CORRETO", "INCORRETO"])
  result?: "CORRETO" | "INCORRETO";

  @ApiProperty({ required: false }) @IsOptional() @IsString() observation?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}
