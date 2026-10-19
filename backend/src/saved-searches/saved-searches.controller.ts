import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf } from '../common/utils/account';
import { SavedSearchesService } from './saved-searches.service';

/** Alertes de recherche du membre (page « Alertes » et bouton 🔔 de Parcourir). */
@UseGuards(JwtAuthGuard)
@Controller('saved-searches')
export class SavedSearchesController {
  constructor(private searches: SavedSearchesService) {}

  @Get()
  list(@Request() req: any) { return this.searches.list(accountOf(req)); }

  @Post()
  create(@Body() body: any, @Request() req: any) { return this.searches.create(accountOf(req), body ?? {}); }

  @Post('preview')
  preview(@Body('query') query: unknown, @Request() req: any) { return this.searches.preview(accountOf(req), query); }

  @Post(':id/check')
  check(@Param('id') id: string, @Request() req: any) { return this.searches.checkNow(accountOf(req), id); }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.searches.update(accountOf(req), id, body ?? {}); }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) { return this.searches.remove(accountOf(req), id); }
}
