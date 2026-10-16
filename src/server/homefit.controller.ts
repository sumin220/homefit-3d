import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { ArgonService, type AnalyzeRoomDto, type VerifySceneDto } from './argon.service';

@Controller('api')
export class HomeFitController {
  constructor(
    @Inject(ArgonService)
    private readonly argonService: ArgonService
  ) {}

  @Get('health')
  getHealth() {
    return this.argonService.getHealthStatus();
  }

  @Get('presets')
  getPresets() {
    return this.argonService.getPresets();
  }

  @Post('analyze-room')
  @HttpCode(HttpStatus.OK)
  async analyzeRoom(@Body() body: AnalyzeRoomDto) {
    try {
      return await this.argonService.analyzeRoom(body);
    } catch (error: any) {
      throw new HttpException(
        {
          error: 'Failed to analyze room scene',
          detail: error?.message || String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('verify-scene')
  @HttpCode(HttpStatus.OK)
  verifyScene(@Body() body: VerifySceneDto) {
    try {
      return this.argonService.verifyScene(body);
    } catch (error: any) {
      throw new HttpException(
        {
          error: 'Failed to verify 3D scene',
          detail: error?.message || String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
