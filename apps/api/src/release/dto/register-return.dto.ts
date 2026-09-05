import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

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
}
