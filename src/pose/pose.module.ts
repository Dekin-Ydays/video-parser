import { Module } from '@nestjs/common';
import { PoseController } from './controllers/pose.controller';
import { PoseGateway } from './controllers/pose.gateway';
import { PoseService } from './pose.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PoseController],
  providers: [PoseGateway, PoseService, PrismaService],
})
export class PoseModule {}
