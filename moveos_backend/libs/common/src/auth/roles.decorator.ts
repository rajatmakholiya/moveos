import { SetMetadata } from '@nestjs/common';

export type AppRole = 'DRIVER' | 'ADMIN' | 'PASSENGER' | 'SUPER_ADMIN' | 'ORG_ADMIN';
export const ROLES_KEY = 'roles';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
