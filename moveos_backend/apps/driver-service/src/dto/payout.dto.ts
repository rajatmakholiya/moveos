import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class SetupPayoutProfileDto {
  @IsString()
  accountHolderName!: string;

  @IsString()
  @Matches(/^\d{9,18}$/, { message: 'accountNumber must be 9-18 digits' })
  accountNumber!: string;

  @IsString()
  @Matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, { message: 'ifsc must be a valid IFSC code' })
  ifsc!: string;

  @IsOptional()
  @IsString()
  vpa?: string;
}

export class RequestPayoutDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amountPaise?: number;

  @IsOptional()
  @IsIn(['IMPS', 'NEFT', 'UPI'])
  mode?: 'IMPS' | 'NEFT' | 'UPI';
}
