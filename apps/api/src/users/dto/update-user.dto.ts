import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@reanalise-erp/types";
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const ROLES: UserRole[] = ["ADMINISTRADOR", "LIDERANCA", "ANALISTA"];

export class UpdateUserDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiProperty({ required: false, enum: ROLES }) @IsOptional() @IsIn(ROLES) role?: UserRole;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() active?: boolean;
}
