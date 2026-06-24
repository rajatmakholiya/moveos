import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { inspect } from 'util';

const repoRoot = path.resolve(__dirname, '..');
const envFile = process.env.ENV_FILE || '.env';
const envPath = path.isAbsolute(envFile) ? envFile : path.join(repoRoot, envFile);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: path.join(repoRoot, '.env') });
}

const prisma = new PrismaClient();

type Args = {
  command: string;
  table?: string;
  limit: number;
};

const usage = `
Database inspector

Usage:
  npm run db:tables
  npm run db:counts
  npm run db:important
  npm run db:preview
  npm run db:table -- User --limit 20
  npm run db:table -- SeatBooking --limit 50

Commands:
  tables    List database tables in the public schema
  counts    Show row counts for every table
  important Show common joined views for app debugging
  preview   Show recent rows from every table
  table     Show rows from one table

Connection:
  Uses DATABASE_URL from .env by default.
  Use another env file with ENV_FILE=apps/booking-service/.env npm run db:tables
`;

function parseArgs(): Args {
  const rawArgs = process.argv.slice(2);
  const [command = 'help'] = rawArgs;
  const limitFlagIndex = rawArgs.indexOf('--limit');
  const limit =
    limitFlagIndex >= 0 && rawArgs[limitFlagIndex + 1]
      ? Number(rawArgs[limitFlagIndex + 1])
      : command === 'preview'
        ? 5
        : 20;

  return {
    command,
    table: command === 'table' && rawArgs[1] && !rawArgs[1].startsWith('--') ? rawArgs[1] : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 20,
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]),
    );
  }
  return value;
}

function printRows(rows: unknown[]): void {
  const normalized = rows.map((row) => normalizeValue(row));

  if (normalized.length === 0) {
    console.log('(no rows)');
    return;
  }

  console.table(normalized);
}

async function getTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  return rows.map((row) => row.table_name);
}

async function assertTableExists(table: string): Promise<void> {
  const tables = await getTables();

  if (!tables.includes(table)) {
    throw new Error(
      `Unknown table "${table}". Available tables: ${tables.join(', ')}`,
    );
  }
}

async function printTables(): Promise<void> {
  const tables = await getTables();
  printRows(tables.map((table) => ({ table })));
}

async function printCounts(): Promise<void> {
  const tables = await getTables();
  const counts = [];

  for (const table of tables) {
    const quotedTable = quoteIdentifier(table);
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${quotedTable};`,
    );
    counts.push({ table, rows: result[0]?.count ?? BigInt(0) });
  }

  printRows(counts);
}

async function printTable(table: string, limit: number): Promise<void> {
  await assertTableExists(table);
  const quotedTable = quoteIdentifier(table);
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT * FROM ${quotedTable} ORDER BY 1 DESC LIMIT $1;`,
    limit,
  );

  printRows(rows);
}

async function printPreview(limit: number): Promise<void> {
  const tables = await getTables();

  for (const table of tables) {
    console.log(`\n=== ${table} (latest ${limit}) ===`);
    await printTable(table, limit);
  }
}

async function printImportant(limit: number): Promise<void> {
  const queries: Array<{ title: string; sql: string }> = [
    {
      title: 'Users with driver/passenger profiles',
      sql: `
        SELECT
          u.id,
          u.phone,
          u.role,
          u.name,
          u.status,
          d.id AS "driverId",
          d.status AS "driverStatus",
          p.id AS "passengerId",
          u."createdAt"
        FROM "User" u
        LEFT JOIN "Driver" d ON d."userId" = u.id
        LEFT JOIN "Passenger" p ON p."userId" = u.id
        ORDER BY u."createdAt" DESC
        LIMIT $1;
      `,
    },
    {
      title: 'Driver vehicle assignments',
      sql: `
        SELECT
          a.id,
          a.active,
          d.id AS "driverId",
          d.name AS "driverName",
          d.status AS "driverStatus",
          v.id AS "vehicleId",
          v.plate,
          v.type,
          v.status AS "vehicleStatus"
        FROM "DriverVehicleAssignment" a
        JOIN "Driver" d ON d.id = a."driverId"
        JOIN "Vehicle" v ON v.id = a."vehicleId"
        ORDER BY a.active DESC, d.name ASC
        LIMIT $1;
      `,
    },
    {
      title: 'Scheduled trips with route and capacity',
      sql: `
        SELECT
          t.id,
          t.status,
          r.name AS route,
          r."originLabel",
          r."destinationLabel",
          d.name AS driver,
          v.plate,
          t."departureAt",
          t."frontSeatsBooked",
          t."frontSeatsTotal",
          t."backSeatsBooked",
          t."backSeatsTotal"
        FROM "ScheduledTrip" t
        JOIN "Route" r ON r.id = t."routeId"
        JOIN "Driver" d ON d.id = t."driverId"
        LEFT JOIN "Vehicle" v ON v.id = t."vehicleId"
        ORDER BY t."departureAt" DESC
        LIMIT $1;
      `,
    },
    {
      title: 'Seat bookings with trip context',
      sql: `
        SELECT
          b.id,
          b.status,
          b."passengerName",
          b."passengerPhone",
          b."seatType",
          b."paymentMethod",
          b."paymentStatus",
          b."totalFare",
          r.name AS route,
          t."departureAt",
          b."createdAt"
        FROM "SeatBooking" b
        JOIN "ScheduledTrip" t ON t.id = b."tripId"
        JOIN "Route" r ON r.id = t."routeId"
        ORDER BY b."createdAt" DESC
        LIMIT $1;
      `,
    },
    {
      title: 'Recent onboarding sessions',
      sql: `
        SELECT
          s.id,
          s."userRole",
          s.status,
          s.phone,
          s.name,
          s."otpVerifiedAt",
          s."completedAt",
          COUNT(DISTINCT c.id) AS consents,
          COUNT(DISTINCT va.id) AS "verificationAttempts",
          s."createdAt"
        FROM "OnboardingSession" s
        LEFT JOIN "OnboardingConsent" c ON c."sessionId" = s.id
        LEFT JOIN "VerificationAttempt" va ON va."sessionId" = s.id
        GROUP BY s.id
        ORDER BY s."createdAt" DESC
        LIMIT $1;
      `,
    },
    {
      title: 'Rides with driver, vehicle, events, and payments',
      sql: `
        SELECT
          ride.id,
          ride.status,
          d.name AS driver,
          v.plate,
          COUNT(DISTINCT e.id) AS events,
          COUNT(DISTINCT p.id) AS payments,
          ride."createdAt",
          ride."updatedAt"
        FROM "Ride" ride
        LEFT JOIN "Driver" d ON d.id = ride."driverId"
        LEFT JOIN "Vehicle" v ON v.id = ride."vehicleId"
        LEFT JOIN "RideEvent" e ON e."rideId" = ride.id
        LEFT JOIN "Payment" p ON p."rideId" = ride.id
        GROUP BY ride.id, d.name, v.plate
        ORDER BY ride."createdAt" DESC
        LIMIT $1;
      `,
    },
    {
      title: 'Wallet balances by account',
      sql: `
        SELECT
          "accountType",
          "accountId",
          SUM(CASE WHEN "entryType" = 'CREDIT' THEN amount ELSE -amount END) AS balance,
          COUNT(*) AS entries
        FROM "WalletLedger"
        GROUP BY "accountType", "accountId"
        ORDER BY balance DESC
        LIMIT $1;
      `,
    },
  ];

  for (const query of queries) {
    console.log(`\n=== ${query.title} ===`);
    const rows = await prisma.$queryRawUnsafe<unknown[]>(query.sql, limit);
    printRows(rows);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      `DATABASE_URL is missing. Checked ${envPath}. Copy .env.example to .env or set ENV_FILE.`,
    );
  }

  switch (args.command) {
    case 'tables':
      await printTables();
      break;
    case 'counts':
      await printCounts();
      break;
    case 'important':
      await printImportant(args.limit);
      break;
    case 'preview':
      await printPreview(args.limit);
      break;
    case 'table':
      if (!args.table) throw new Error('Missing table name. Example: npm run db:table -- User');
      await printTable(args.table, args.limit);
      break;
    default:
      console.log(usage.trim());
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : inspect(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
