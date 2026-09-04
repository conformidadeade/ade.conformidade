import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsString, IsUUID, MinLength } from "class-validator";

export class ManualActionDto {
  @ApiProperty() @IsUUID() analystId!: string;
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;

  @ApiProperty() @IsString() @MinLength(1) reason!: string;
  @ApiProperty() @IsDateString() occurredAt!: string;
}
