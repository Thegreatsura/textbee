import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
  Get,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import {
  ReceivedSMSDTO,
  RegisterDeviceInputDTO,
  RetrieveSMSResponseDTO,
  SendBulkSMSInputDTO,
  SendBulkSMSRequestDTO,
  SendSMSInputDTO,
  SendSMSRequestDTO,
  UpdateSMSStatusDTO,
  HeartbeatInputDTO,
  HeartbeatResponseDTO,
} from './gateway.dto'
import { GatewayService } from './gateway.service'
import { CanModifyDevice } from './guards/can-modify-device.guard'

// Query params arrive as strings; non-integer or out-of-range values resolve
// to the defaults (page 1, limit 50) and limit is capped at 100.
function parsePagination(query: {
  page?: string
  limit?: string
}): { page: number; limit: number } {
  const page = parseInt(String(query?.page), 10)
  const limit = parseInt(String(query?.limit), 10)
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50,
  }
}

@ApiTags('gateway')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@Controller('gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @UseGuards(AuthGuard)
  @Get('/stats')
  async getStats(@Request() req) {
    const data = await this.gatewayService.getStatsForUser(req.user)
    return { data }
  }

  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Register device' })
  @Post('/devices')
  async registerDevice(@Body() input: RegisterDeviceInputDTO, @Request() req) {
    const data = await this.gatewayService.registerDevice(input, req.user)
    return { data }
  }

  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List of registered devices' })
  @Get('/devices')
  async getDevices(@Request() req) {
    const data = await this.gatewayService.getDevicesForUser(req.user)
    return { data }
  }

  @ApiOperation({ summary: 'Update device' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Patch('/devices/:id')
  async updateDevice(
    @Param('id') deviceId: string,
    @Body() input: RegisterDeviceInputDTO,
  ) {
    const data = await this.gatewayService.updateDevice(deviceId, input)
    return { data }
  }

  @ApiOperation({ summary: 'Device heartbeat' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Post('/devices/:id/heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @Param('id') deviceId: string,
    @Body() input: HeartbeatInputDTO,
  ): Promise<HeartbeatResponseDTO> {
    const data = await this.gatewayService.heartbeat(deviceId, input)
    return data
  }

  @ApiOperation({ summary: 'Delete device' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Delete('/devices/:id')
  async deleteDevice(@Param('id') deviceId: string) {
    const data = await this.gatewayService.deleteDevice(deviceId)
    return { data }
  }

  @ApiOperation({ summary: 'Set device as the default sender' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Post('/devices/:id/set-default')
  @HttpCode(HttpStatus.OK)
  async setDefaultDevice(@Param('id') deviceId: string) {
    const data = await this.gatewayService.setDefaultDevice(deviceId)
    return { data }
  }

  @ApiOperation({
    summary:
      'Send SMS. deviceId is optional: defaults to your default device, else the most recently active enabled device.',
  })
  @UseGuards(AuthGuard)
  @Post('/send-sms')
  @HttpCode(HttpStatus.OK)
  async sendSMSDeviceless(@Request() req, @Body() body: SendSMSRequestDTO) {
    const device = await this.gatewayService.resolveSenderDevice(
      req.user,
      body.deviceId,
    )
    const data = await this.gatewayService.sendSMS(device._id.toString(), body)
    return { data }
  }

  @ApiOperation({
    summary:
      'Send Bulk SMS. deviceId is optional: defaults to your default device, else the most recently active enabled device.',
  })
  @UseGuards(AuthGuard)
  @Post('/send-bulk-sms')
  @HttpCode(HttpStatus.OK)
  async sendBulkSMSDeviceless(
    @Request() req,
    @Body() body: SendBulkSMSRequestDTO,
  ) {
    const device = await this.gatewayService.resolveSenderDevice(
      req.user,
      body.deviceId,
    )
    const data = await this.gatewayService.sendBulkSMS(
      device._id.toString(),
      body,
    )
    return { data }
  }

  @ApiOperation({
    summary:
      'Deprecated: use POST /gateway/send-sms with an optional deviceId in the body. Send SMS to a device.',
    deprecated: true,
  })
  @UseGuards(AuthGuard, CanModifyDevice)
  // deprecate sendSMS route in favor of send-sms, but allow both to prevent breaking changes
  @Post(['/devices/:id/sendSMS', '/devices/:id/send-sms'])
  async sendSMS(
    @Param('id') deviceId: string,
    @Body() smsData: SendSMSInputDTO,
  ) {
    const data = await this.gatewayService.sendSMS(deviceId, smsData)
    return { data }
  }

  @ApiOperation({
    summary:
      'Deprecated: use POST /gateway/send-bulk-sms with an optional deviceId in the body. Send Bulk SMS.',
    deprecated: true,
  })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Post(['/devices/:id/send-bulk-sms'])
  async sendBulkSMS(
    @Param('id') deviceId: string,
    @Body() body: SendBulkSMSInputDTO,
  ) {
    const data = await this.gatewayService.sendBulkSMS(deviceId, body)
    return { data }
  }


  @ApiOperation({ summary: 'Received SMS from a device' })
  @HttpCode(HttpStatus.OK)
  @Post('/devices/:id/receive-sms')
  @UseGuards(AuthGuard, CanModifyDevice)
  async receiveSMS(@Param('id') deviceId: string, @Body() dto: ReceivedSMSDTO) {
    const data = await this.gatewayService.receiveSMS(deviceId, dto)
    return { data }
  }

  @ApiOperation({
    summary:
      'Deprecated: use POST /gateway/devices/{id}/receive-sms. Received SMS from a device.',
    deprecated: true,
  })
  @HttpCode(HttpStatus.OK)
  // legacy alias kept for older app versions and integrations
  @Post('/devices/:id/receiveSMS')
  @UseGuards(AuthGuard, CanModifyDevice)
  async receiveSMSLegacy(
    @Param('id') deviceId: string,
    @Body() dto: ReceivedSMSDTO,
  ) {
    return await this.receiveSMS(deviceId, dto)
  }

  @ApiOperation({ summary: 'Get received SMS from a device' })
  @ApiResponse({ status: 200, type: RetrieveSMSResponseDTO })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (default: 50, max: 100)' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Get('/devices/:id/get-received-sms')
  async getReceivedSMS(
    @Param('id') deviceId: string,
    @Request() req,
  ): Promise<RetrieveSMSResponseDTO> {
    // Malformed or out-of-range values fall back to defaults instead of
    // erroring, so existing callers keep working.
    const { page, limit } = parsePagination(req.query)

    const result = await this.gatewayService.getReceivedSMS(deviceId, page, limit)
    return result;
  }

  @ApiOperation({
    summary:
      'Deprecated: use GET /gateway/devices/{id}/get-received-sms. Get received SMS from a device.',
    deprecated: true,
  })
  @ApiResponse({ status: 200, type: RetrieveSMSResponseDTO })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (default: 50, max: 100)' })
  @UseGuards(AuthGuard, CanModifyDevice)
  // legacy alias kept for older app versions and integrations
  @Get('/devices/:id/getReceivedSMS')
  async getReceivedSMSLegacy(
    @Param('id') deviceId: string,
    @Request() req,
  ): Promise<RetrieveSMSResponseDTO> {
    return await this.getReceivedSMS(deviceId, req)
  }

  @ApiOperation({ summary: 'Get message history (sent and received) from a device' })
  @ApiResponse({ status: 200, type: RetrieveSMSResponseDTO })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (default: 50, max: 100)' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Filter by message type: all, sent, or received (default: all)' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Get('/devices/:id/messages')
  async getMessages(
    @Param('id') deviceId: string,
    @Request() req,
  ): Promise<RetrieveSMSResponseDTO> {
    const { page, limit } = parsePagination(req.query)
    const type = req.query.type || '';
    const search = req.query.search || '';

    const result = await this.gatewayService.getMessages(deviceId, type, page, limit, search);
    return result;
  }

  @ApiOperation({ summary: 'Update SMS status' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @HttpCode(HttpStatus.OK)
  @Patch('/devices/:id/sms-status')
  async updateSMSStatus(
    @Param('id') deviceId: string,
    @Body() dto: UpdateSMSStatusDTO,
  ) {
    const data = await this.gatewayService.updateSMSStatus(deviceId, dto);
    return { data };
  }

  @ApiOperation({ summary: 'Get a single SMS by ID' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Get('/devices/:id/sms/:smsId')
  async getSMSById(
    @Param('id') deviceId: string,
    @Param('smsId') smsId: string,
  ) {
    const data = await this.gatewayService.getSMSById(deviceId, smsId);
    return { data };
  }

  @ApiOperation({ summary: 'Get an SMS batch by ID with all its SMS messages' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Get('/devices/:id/sms-batch/:smsBatchId')
  async getSmsBatchById(
    @Param('id') deviceId: string,
    @Param('smsBatchId') smsBatchId: string,
  ) {
    const data = await this.gatewayService.getSmsBatchById(
      deviceId,
      smsBatchId,
    );
    return { data };
  }
}
