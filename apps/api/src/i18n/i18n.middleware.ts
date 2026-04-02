import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { I18nService } from './i18n.service'

@Injectable()
export class I18nMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const locale = I18nService.parseLocale(req.headers['accept-language'])
    I18nService.runWithLocale(locale, () => next())
  }
}
