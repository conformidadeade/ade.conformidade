import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

/** Client e MediaChannel têm o mesmo formato de cadastro (item 18). */
export class CreateCatalogEntryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class UpdateCatalogEntryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class InactivateDto {
  @ApiProperty({ description: "Motivo obrigatório — exibido na confirmação (item 27) e gravado no audit log." })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class CreateAnalystDto extends CreateCatalogEntryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() registration?: string;
}

export class UpdateAnalystDto extends UpdateCatalogEntryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() registration?: string;
}
