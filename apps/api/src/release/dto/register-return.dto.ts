import { ApiProperty } from "@nestjs/swagger";
import { ReturnOrigin } from "@reanalise-erp/types";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

const ORIGINS: ReturnOrigin[] = ["REANALISE", "CLIENTE"];

export class RegisterReturnDto {
  @ApiProperty() @IsUUID() analystId!: string;
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;

  @ApiProperty({
    description:
      "Texto livre, sempre aceito — o sistema tenta vincular a um processo já lançado automaticamente, sem exigir isso do usuário.",
  })
  @IsString()
  @MinLength(1)
  piNumber!: string;

  @ApiProperty() @IsString() @MinLength(1) reason!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() observation?: string;
  @ApiProperty() @IsDateString() occurredAt!: string;

  /** Adendo "Origem da devolução" — obrigatória, sem default silencioso: a
   * liderança escolhe explicitamente na tela. Puramente informativa, nunca
   * lida por packages/release-engine. */
  @ApiProperty({ enum: ORIGINS })
  @IsIn(ORIGINS)
  origin!: ReturnOrigin;
}
