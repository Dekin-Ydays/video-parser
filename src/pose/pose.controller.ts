import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PoseService } from './pose.service';

@Controller('pose')
export class PoseController {
  constructor(private readonly poseService: PoseService) {}

  @Get('clients')
  listClients() {
    return this.poseService.listClients();
  }

  @Get('latest/:clientId')
  getLatest(@Param('clientId') clientId: string) {
    const latest = this.poseService.getLatest(clientId);
    if (!latest) throw new NotFoundException('No pose data for client');
    return latest;
  }
}
