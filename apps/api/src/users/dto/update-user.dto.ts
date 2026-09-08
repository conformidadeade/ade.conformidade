import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@reanalise-erp/types";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from "class-validator";

const ROLES: UserRole[] = ["ADMINISTRADOR", "LIDERANCA", "ANALISTA"];

export class UpdateUserDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiProperty({ required: false, enum: ROLES }) @IsOptional() @IsIn(ROLES) role?: UserRole;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() active?: boolean;

  /**
   * Troca de senha (adendo "Deploy limpo", 08/09/2026) — cobre a lacuna de
   * não haver ainda um fluxo dedicado de "trocar senha no primeiro login":
   * um ADMINISTRADOR pode definir uma nova senha para qualquer usuário
   * (inclusive a própria conta) por aqui. `undefined`/ausente = não altera.
   */
  @ApiProperty({ required: false, description: "Nova senha — ausente/omitido não altera a senha atual." })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /**
   * Vínculo com um Analyst do cadastro (adendo "Acesso restrito", item 2).
   * `undefined` (campo ausente do corpo) = não mexe no vínculo atual;
   * `null` explícito = desvincular; string = vincular a esse Analyst.
   * Distinto de `undefined` propositalmente — ver UsersService.update.
   */
  @ApiProperty({ required: false, nullable: true, description: "UUID do Analyst, ou null para desvincular." })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  analystId?: string | null;
}
