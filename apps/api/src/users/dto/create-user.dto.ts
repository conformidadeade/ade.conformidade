import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@reanalise-erp/types";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

const ROLES: UserRole[] = ["ADMINISTRADOR", "LIDERANCA", "ANALISTA"];

export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty({ enum: ROLES }) @IsIn(ROLES) role!: UserRole;

  @ApiProperty({ required: false, description: "Vincula o login a um Analyst já cadastrado (perfil ANALISTA)." })
  @IsOptional()
  @IsUUID()
  analystId?: string;
}
