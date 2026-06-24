import { strict as assert } from 'assert';
import { ConflictException } from '@nestjs/common';
import { AdminRoutesController, toLegacyRouteFields } from './routes.controller';

const activeRoute = toLegacyRouteFields({
  fromCity: '  Pithoragarh  ',
  toCity: 'Dehradun',
  routeName: 'Pithoragarh to Dehradun',
  distanceKm: 460,
  baseFarePaise: 140000,
  estimatedDurationMinutes: 780,
});

assert.deepEqual(activeRoute, {
  name: 'Pithoragarh to Dehradun',
  originLabel: 'Pithoragarh',
  destinationLabel: 'Dehradun',
  distanceKm: 460,
  estimatedHours: 13,
  isActive: true,
  baseFrontPrice: 140000,
  baseBackPrice: 140000,
  fromCity: 'Pithoragarh',
  toCity: 'Dehradun',
  routeName: 'Pithoragarh to Dehradun',
  baseFarePaise: 140000,
  estimatedDurationMinutes: 780,
  status: 'ACTIVE',
  metadataJson: undefined,
});

const inactiveRoute = toLegacyRouteFields({
  fromCity: 'A',
  toCity: 'B',
  routeName: 'A to B',
  distanceKm: 1,
  baseFarePaise: 100,
  estimatedDurationMinutes: 61,
}, 'INACTIVE');

assert.equal(inactiveRoute.estimatedHours, 2);
assert.equal(inactiveRoute.isActive, false);
assert.equal(inactiveRoute.status, 'INACTIVE');

async function runControllerTests() {
  let createdData: unknown;
  const createController = new AdminRoutesController({
    route: {
      findFirst: async () => null,
      create: async ({ data }: { data: unknown }) => {
        createdData = data;
        return { id: 'route_1', ...(data as Record<string, unknown>) };
      },
    },
  } as any);

  await createController.createRoute({
    fromCity: 'Pithoragarh',
    toCity: 'Dehradun',
    routeName: 'Pithoragarh to Dehradun',
    distanceKm: 460,
    baseFarePaise: 140000,
    estimatedDurationMinutes: 780,
  });
  assert.equal((createdData as Record<string, unknown>).fromCity, 'Pithoragarh');
  assert.equal((createdData as Record<string, unknown>).baseFarePaise, 140000);

  const duplicateController = new AdminRoutesController({
    route: {
      findFirst: async () => ({ id: 'existing_route' }),
      create: async () => {
        throw new Error('create should not be called for duplicates');
      },
    },
  } as any);

  await assert.rejects(
    () => duplicateController.createRoute({
      fromCity: 'pithoragarh',
      toCity: 'dehradun',
      routeName: 'Duplicate',
      distanceKm: 460,
      baseFarePaise: 140000,
      estimatedDurationMinutes: 780,
    }),
    ConflictException,
  );
}

void runControllerTests().then(() => {
  console.log('routes controller contract tests passed');
});
