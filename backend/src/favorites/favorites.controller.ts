import { Controller, Delete, Get, Param, Put, Request, UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private favoritesService: FavoritesService) {}

  @Get()
  list(@Request() req: any) {
    return this.favoritesService.list(req.user.userId);
  }

  /** Identifiants seuls : sert à afficher l'étoile pleine ou vide dans les listes. */
  @Get('ids')
  ids(@Request() req: any) {
    return this.favoritesService.ids(req.user.userId);
  }

  @Put(':torrentId')
  add(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.favoritesService.add(req.user.userId, torrentId);
  }

  @Delete(':torrentId')
  remove(@Param('torrentId') torrentId: string, @Request() req: any) {
    return this.favoritesService.remove(req.user.userId, torrentId);
  }
}
