import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class RejectDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class ApproveDriverDto {
  @IsString()
  @IsNotEmpty()
  organizationDriverId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class RejectDriverDto {
  @IsString()
  @IsNotEmpty()
  organizationDriverId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
