import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignDriverToVehicleDto {
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsIn(['PRIMARY', 'SECONDARY'])
  assignmentType!: 'PRIMARY' | 'SECONDARY';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  replaceExistingPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  replaceExistingVehicle?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  replacementReason?: string;
}

export class SuspendAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class RemoveAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
