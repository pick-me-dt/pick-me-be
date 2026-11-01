import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  /** Pleos 기기 식별자 (에뮬레이터는 임의 문자열) */
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plateNumber: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

export class StaffLoginDto {
  @IsString()
  @IsNotEmpty()
  loginId: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
