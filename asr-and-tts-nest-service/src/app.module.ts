import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import { ControllerService } from './controller/controller.service';
import { SpeechModule } from './speech/speech.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    AiModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot({
      maxListeners: 200,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public')
    }),
    SpeechModule,
  ],
  controllers: [AppController],
  providers: [AppService, ControllerService],
})
export class AppModule {}
