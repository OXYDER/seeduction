import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AiService, SuggestDescriptionInput } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Get('status')
  status() {
    return { enabled: this.aiService.enabled };
  }

  @Post('suggest-description')
  suggestDescription(@Body() body: SuggestDescriptionInput, @Request() req: any) {
    return this.aiService.suggestDescription(req.user.userId, body);
  }
}
