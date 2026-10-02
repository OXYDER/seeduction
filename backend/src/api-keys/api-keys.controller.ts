import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiKeysService, API_SCOPES } from './api-keys.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { accountOf, assertMaster } from '../common/utils/account';

/** Gestion des clés API par leur propriétaire, via une session web normale (JWT) — pas l'API publique elle-même. */
@UseGuards(JwtAuthGuard)
@Controller('keys')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Get('scopes')
  scopes() {
    return API_SCOPES;
  }

  @Get()
  list(@Request() req: any) {
    assertMaster(req);
    return this.apiKeysService.list(accountOf(req));
  }

  @Post()
  create(@Body() body: { label: string; scopes: string[] }, @Request() req: any) {
    assertMaster(req);
    return this.apiKeysService.create(accountOf(req), body.label, body.scopes ?? []);
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @Request() req: any) {
    assertMaster(req);
    return this.apiKeysService.revoke(accountOf(req), id);
  }
}
