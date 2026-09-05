import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, MinLength } from "class-validator";

/** Cadastro manual de habilidade avulsa (adendo Fase 2, item 6.2). */
export class CreateSkillEvidenceDto {
  @ApiProperty() @IsUUID() analystId!: string;
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;
  @ApiProperty() @IsString() @MinLength(1) piNumber!: string;
}
