import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('collections')
export class CollectionsController {
  constructor(private collectionsService: CollectionsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@Request() req: any) {
    return this.collectionsService.mine(req.user.userId);
  }

  @Get('public')
  publicCollections() {
    return this.collectionsService.publicCollections();
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.collectionsService.findOne(id, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: { name: string; description?: string; visibility?: string }, @Request() req: any) {
    return this.collectionsService.create(req.user.userId, body.name, body.description, body.visibility ?? 'PRIVATE');
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; visibility?: string },
    @Request() req: any,
  ) {
    return this.collectionsService.update(id, req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.collectionsService.delete(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: { torrentId: string; note?: string }, @Request() req: any) {
    return this.collectionsService.addItem(id, req.user.userId, body.torrentId, body.note);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/items/:torrentId')
  removeItem(@Param('id') id: string, @Param('torrentId') torrentId: string, @Request() req: any) {
    return this.collectionsService.removeItem(id, req.user.userId, torrentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/collaborators')
  addCollaborator(@Param('id') id: string, @Body('username') username: string, @Request() req: any) {
    return this.collectionsService.addCollaborator(id, req.user.userId, username);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/collaborators/:userId')
  removeCollaborator(@Param('id') id: string, @Param('userId') userId: string, @Request() req: any) {
    return this.collectionsService.removeCollaborator(id, req.user.userId, userId);
  }
}
