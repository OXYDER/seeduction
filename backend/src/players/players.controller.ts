import { BadRequestException, Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { isPlatform, PlayersService } from './players.service';

/** Public : la liste des versions des lecteurs (page de téléchargement, mises à jour des lecteurs) et les installateurs eux-mêmes. */
@Controller('downloads/players')
export class PlayersPublicController {
  constructor(private players: PlayersService) {}

  @Get()
  list() { return this.players.publicList(); }

  @Get(':platform')
  async download(@Param('platform') platform: string, @Res() res: Response) {
    if (!isPlatform(platform)) throw new BadRequestException('Système inconnu.');
    const f = await this.players.fileFor(platform);
    res.type(f.mime);
    res.download(f.path, f.name);
  }
}
