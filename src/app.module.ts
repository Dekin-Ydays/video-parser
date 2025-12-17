import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PoseModule } from './pose/pose.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PoseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
