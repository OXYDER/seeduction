import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Request } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const STAFF_ROLES = ['MODERATOR', 'ADMIN', 'OWNER'];

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get()
  list(@Request() req: any) {
    return this.templatesService.list(req.user.userId);
  }

  @Get(':id/variables')
  variables(@Param('id') id: string) {
    return this.templatesService.variablesOf(id);
  }

  @Post()
  create(@Body() body: { name: string; kind: string; content: string; global?: boolean }, @Request() req: any) {
    return this.templatesService.create(req.user.userId, STAFF_ROLES.includes(req.user.role), body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; content?: string }, @Request() req: any) {
    return this.templatesService.update(id, req.user.userId, STAFF_ROLES.includes(req.user.role), body);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.templatesService.delete(id, req.user.userId, STAFF_ROLES.includes(req.user.role));
  }

  @Post('generate')
  generate(@Body() body: { templateId?: string; content?: string; values: Record<string, string> }) {
    return this.templatesService.generate({ templateId: body.templateId, content: body.content, values: body.values ?? {} });
  }
}
