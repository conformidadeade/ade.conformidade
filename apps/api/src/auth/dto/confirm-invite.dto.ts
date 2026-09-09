import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ConfirmInviteDto {
  @ApiProperty() @IsString() @MinLength(1) token!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
}
