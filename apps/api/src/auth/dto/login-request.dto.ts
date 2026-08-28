import { IsEmail, IsString, MinLength } from 'class-validator';
import { LoginRequest } from '@marketplace/shared';

export class LoginRequestDto implements LoginRequest {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
