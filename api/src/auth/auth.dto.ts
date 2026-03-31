import { ApiProperty } from '@nestjs/swagger'

export class RegisterInputDTO {
  @ApiProperty({ type: String, required: true })
  name: string

  @ApiProperty({ type: String, required: true })
  email: string

  @ApiProperty({ type: String })
  phone?: string

  @ApiProperty({ type: String, required: true })
  password: string

  @ApiProperty({ type: String, required: true })
  turnstileToken: string
}

export class LoginInputDTO {
  @ApiProperty({ type: String, required: true })
  email: string

  @ApiProperty({ type: String, required: true })
  password: string

  @ApiProperty({ type: String, required: true })
  turnstileToken: string
}

export class RequestResetPasswordInputDTO {
  @ApiProperty({ type: String, required: true })
  email: string

  @ApiProperty({ type: String, required: true })
  turnstileToken: string
}

export class ResetPasswordInputDTO {
  @ApiProperty({ type: String, required: true })
  email: string

  @ApiProperty({ type: String, required: true })
  otp: string

  @ApiProperty({ type: String, required: true })
  newPassword: string
}

export class UpdateOnboardingDTO {
  @ApiProperty({ required: false })
  currentStepId?: string

  @ApiProperty({ required: false, description: 'Only allowed for optional steps' })
  skipStepId?: string

  @ApiProperty({ required: false, description: 'When true, sets onboarding.completedAt' })
  complete?: boolean
}

