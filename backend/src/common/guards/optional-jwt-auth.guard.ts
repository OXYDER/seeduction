import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Comme JwtAuthGuard, mais n'échoue jamais : req.user reste undefined si aucun token valide. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    return user || undefined;
  }
}
