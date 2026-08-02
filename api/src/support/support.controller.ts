import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import {
  CreateSupportMessageDto,
  SupportCategory,
} from './dto/create-support-message.dto'
import { SupportService } from './support.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Request } from 'express'
import { AuthGuard } from '../auth/guards/auth.guard'
import { TurnstileService } from '../common/turnstile.service'

@Controller('support')
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly turnstileService: TurnstileService,
  ) {}

  @UseGuards(AuthGuard)
  @Post('customer-support')
  async createSupportMessage(
    @Body() createSupportMessageDto: CreateSupportMessageDto,
    @Req() req: Request,
  ) {
    await this.turnstileService.verify(createSupportMessageDto.turnstileToken)

    const ip = req.ip || (req.headers['x-forwarded-for'] as string)
    const userAgent = req.headers['user-agent'] as string

    // Add request metadata
    createSupportMessageDto.ip = ip
    createSupportMessageDto.userAgent = userAgent

    // Always taken from the token so the body cannot set it
    createSupportMessageDto.user = req.user['_id']

    return this.supportService.createSupportMessage(createSupportMessageDto)
  }

  @UseGuards(JwtAuthGuard)
  @Post('request-account-deletion')
  async requestAccountDeletion(
    @Body() body: { message: string; turnstileToken: string },
    @Req() req: Request,
  ) {
    await this.turnstileService.verify(body.turnstileToken)

    const ip = req.ip || (req.headers['x-forwarded-for'] as string)
    const userAgent = req.headers['user-agent'] as string
    const user = req.user

    const createSupportMessageDto: CreateSupportMessageDto = {
      user: user['_id'],
      name: user['name'],
      email: user['email'],
      category: SupportCategory.ACCOUNT_DELETION,
      message: body.message,
      ip,
      userAgent,
      turnstileToken: body.turnstileToken,
    }

    return this.supportService.requestAccountDeletion(createSupportMessageDto)
  }
}
