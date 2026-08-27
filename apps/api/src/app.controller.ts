import { SHARED_LINK_PROBE } from '@marketplace/shared';
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root(): string {
    return SHARED_LINK_PROBE;
  }
}
