import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@reanalise-erp/types";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

const ROLES: UserRole[] = ["ADMINISTRADOR", "LIDERANCA", "ANALISTA"];

/**
 * Sem campo de senha (adendo "Confirmação de e-mail e recuperação de
 * senha", 09/09/2026) — a conta nasce sem senha, e o próprio usuário a
 * define ao confirmar o convite enviado por e-mail. O Administrador nunca
 * chega a saber a senha de ninguém (decisão confirmada com a liderança).
 */
export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ enum: ROLES }) @IsIn(ROLES) role!: UserRole;

  @ApiProperty({ required: false, description: "Vincula o login a um Analyst já cadastrado (perfil ANALISTA)." })
  @IsOptional()
  @IsUUID()
  analystId?: string;
}
