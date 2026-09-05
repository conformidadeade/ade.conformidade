import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class ListSkillsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() analystId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() mediaChannelId?: string;
}
