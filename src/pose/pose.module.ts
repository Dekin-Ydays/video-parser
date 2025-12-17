import { Module } from '@nestjs/common';
import { PoseController } from './pose.controller';
import { PoseGateway } from './pose.gateway';
import { PoseService } from './pose.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PoseController],
  providers: [PoseGateway, PoseService, PrismaService],
})
export class PoseModule {}
