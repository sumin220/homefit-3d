import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const PORT = Number(process.env.PORT || 8080);

  app.enableCors();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Serve public static assets (preset photos & SVGs)
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.useStaticAssets(publicDir);
  }

  // Serve built frontend in production (Cloud Run)
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.useStaticAssets(distDir);
  }

  await app.init();

  // SPA fallback for non-API routes when dist/index.html exists
  const httpAdapter = app.getHttpAdapter();
  const expressInstance = httpAdapter.getInstance();
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    expressInstance.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distDir, 'index.html'));
      }
      return next();
    });
  }

  await app.listen(PORT, '0.0.0.0');
  console.log(`HomeFit 3D NestJS Server listening on http://0.0.0.0:${PORT}`);
}

bootstrap();
