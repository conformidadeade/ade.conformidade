import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterProcessDto {
  @ApiProperty() @IsUUID() analystId!: string;
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() mediaChannelId!: string;

  @ApiProperty() @IsString() @MinLength(1) piNumber!: string;
  @ApiProperty() @IsDateString() analysisDate!: string;
  @ApiProperty({ enum: ["CORRETO", "INCORRETO"] }) @IsIn(["CORRETO", "INCORRETO"]) result!: "CORRETO" | "INCORRETO";

  @ApiProperty({ required: false }) @IsOptional() @IsString() observation?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}
