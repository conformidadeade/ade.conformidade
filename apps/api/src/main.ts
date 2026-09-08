import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  // Sessão via cookie httpOnly (adendo "Segurança de sessão", 08/09/2026)
  // exige `credentials: true` + origem EXPLÍCITA (nunca "*") — cookies não
  // funcionam entre origens diferentes sem isso. CORS_ORIGIN aponta para o
  // domínio do frontend em produção; em dev, o padrão já é o :4002 local.
  app.enableCors({
    origin: configService.get<string>("CORS_ORIGIN", "http://localhost:4002"),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Reanálise ERP")
    .setDescription("API de controle de liberação de reanálise de processos de mídia")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  // 4001/4002 (ver apps/web) — deliberadamente fora da faixa 3000-3002 usada
  // pelo leilao-erp neste mesmo ambiente, para nunca colidir com ele.
  const port = process.env.PORT ?? 4001;
  await app.listen(port);
}

bootstrap();
