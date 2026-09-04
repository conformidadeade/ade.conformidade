import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterReturnDto {
  @ApiProperty() @IsUUID() analystId!: string;
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;

  @ApiProperty({ required: false }) @IsOptional() @IsUUID() processId?: string;
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() observation?: string;
  @ApiProperty() @IsDateString() occurredAt!: string;

  // TODO(auth): substituir por req.user.id assim que o AuthModule/JwtAuthGuard existir.
  @ApiProperty() @IsUUID() registeredByUserId!: string;
}
