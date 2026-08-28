import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root(): string {
    return 'marketplace-catalog api';
  }
}
