import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /** Staff: email. Citizens: 14-digit national ID. */
  @IsString() @MinLength(5) @MaxLength(254) identifier: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

export class RefreshDto {
  @IsOptional() @IsString() @MaxLength(200) refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain letters and digits' })
  newPassword: string;
}
