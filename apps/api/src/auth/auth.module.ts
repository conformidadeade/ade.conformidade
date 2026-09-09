import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { EmailModule } from "../email/email.module";
import { AuthController } from "./auth.controller";
import { AuthTokenService } from "./auth-token.service";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [PassportModule, JwtModule.register({}), EmailModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, AuthTokenService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, PasswordService, AuthTokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
