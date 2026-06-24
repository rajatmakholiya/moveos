import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';
import { Prisma } from '@prisma/client';
import { CreateAdminRouteDto, UpdateAdminRouteDto, UpdateAdminRouteStatusDto } from '../dto/routes.dto';

type RouteWriteInput = {
  fromCity: string;
  toCity: string;
  routeName: string;
  distanceKm: number;
  baseFarePaise: number;
  estimatedDurationMinutes: number;
  metadataJson?: Record<string, unknown> | null;
};

function normalizeCity(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function toLegacyRouteFields(input: RouteWriteInput, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  return {
    name: input.routeName.trim(),
    originLabel: normalizeCity(input.fromCity),
    destinationLabel: normalizeCity(input.toCity),
    distanceKm: input.distanceKm,
    estimatedHours: Math.max(1, Math.ceil(input.estimatedDurationMinutes / 60)),
    isActive: status === 'ACTIVE',
    baseFrontPrice: input.baseFarePaise,
    baseBackPrice: input.baseFarePaise,
    fromCity: normalizeCity(input.fromCity),
    toCity: normalizeCity(input.toCity),
    routeName: input.routeName.trim(),
    baseFarePaise: input.baseFarePaise,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    status,
    metadataJson: input.metadataJson === null ? Prisma.JsonNull : input.metadataJson as Prisma.InputJsonValue | undefined,
  };
}

// No auth guard — active routes are public information.
@Controller('routes')
export class RoutesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getActiveRoutes() {
    return this.prisma.route.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/routes')
export class AdminRoutesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listRoutes() {
    const routes = await this.prisma.route.findMany({
      orderBy: [{ status: 'asc' }, { routeName: 'asc' }],
    });
    return { routes };
  }

  @Post()
  async createRoute(@Body() body: CreateAdminRouteDto) {
    if (normalizeCity(body.fromCity).toLowerCase() === normalizeCity(body.toCity).toLowerCase()) {
      throw new BadRequestException('fromCity and toCity must be different');
    }

    await this.ensureUniquePair(body.fromCity, body.toCity);

    const route = await this.prisma.route.create({
      data: toLegacyRouteFields(body),
    });
    return { route };
  }

  @Patch(':id')
  async updateRoute(@Param('id') id: string, @Body() body: UpdateAdminRouteDto) {
    const existing = await this.requireRoute(id);
    const next: RouteWriteInput = {
      fromCity: body.fromCity ?? existing.fromCity,
      toCity: body.toCity ?? existing.toCity,
      routeName: body.routeName ?? existing.routeName,
      distanceKm: body.distanceKm ?? existing.distanceKm,
      baseFarePaise: body.baseFarePaise ?? existing.baseFarePaise,
      estimatedDurationMinutes: body.estimatedDurationMinutes ?? existing.estimatedDurationMinutes,
      metadataJson: body.metadataJson === undefined ? (existing.metadataJson as Record<string, unknown> | null) : body.metadataJson,
    };

    if (normalizeCity(next.fromCity).toLowerCase() === normalizeCity(next.toCity).toLowerCase()) {
      throw new BadRequestException('fromCity and toCity must be different');
    }

    await this.ensureUniquePair(next.fromCity, next.toCity, id);

    const route = await this.prisma.route.update({
      where: { id },
      data: toLegacyRouteFields(next, existing.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'),
    });
    return { route };
  }

  @Patch(':id/status')
  async updateRouteStatus(@Param('id') id: string, @Body() body: UpdateAdminRouteStatusDto) {
    await this.requireRoute(id);
    const route = await this.prisma.route.update({
      where: { id },
      data: {
        status: body.status,
        isActive: body.status === 'ACTIVE',
      },
    });
    return { route };
  }

  private async requireRoute(id: string) {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) {
      throw new NotFoundException('Route not found');
    }
    return route;
  }

  private async ensureUniquePair(fromCity: string, toCity: string, excludeId?: string) {
    const existing = await this.prisma.route.findFirst({
      where: {
        fromCity: { equals: normalizeCity(fromCity), mode: 'insensitive' },
        toCity: { equals: normalizeCity(toCity), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('Route pair already exists');
    }
  }
}
