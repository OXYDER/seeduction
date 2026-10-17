import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { accountOf } from '../common/utils/account';
import { QuizService } from './quiz.service';

/** Quiz quotidien : rien n'est misé, donc aucune permission « dépenser » n'est demandée aux profils d'un compte famille. */
@Controller('games/quiz')
export class QuizController {
  constructor(private quiz: QuizService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@Request() req: any) { return this.quiz.overview(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('start')
  start(@Request() req: any) { return this.quiz.start(accountOf(req)); }

  @UseGuards(JwtAuthGuard)
  @Post('answer')
  answer(@Body() body: { index?: number; choice?: number | null }, @Request() req: any) { return this.quiz.answer(accountOf(req), body ?? {}); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Get('admin')
  admin() { return this.quiz.adminOverview(); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin')
  async save(@Body() body: any, @Request() req: any) { return { config: await this.quiz.saveConfig({ userId: req.user.userId, username: req.user.username }, body, req.ip) }; }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Post('admin/questions')
  create(@Body() body: any, @Request() req: any) { return this.quiz.createQuestion({ userId: req.user.userId, username: req.user.username }, body, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Put('admin/questions/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.quiz.updateQuestion({ userId: req.user.userId, username: req.user.username }, id, body, req.ip); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER')
  @Delete('admin/questions/:id')
  remove(@Param('id') id: string, @Request() req: any) { return this.quiz.deleteQuestion({ userId: req.user.userId, username: req.user.username }, id, req.ip); }
}
