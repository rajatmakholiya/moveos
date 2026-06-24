import { strict as assert } from 'assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DocumentStatus, KycDocumentType, KycEntityType } from '@prisma/client';
import { DriverService } from './driver.service';
import { buildOrganizationKycVisibilityWhere } from '../../api-gateway/src/controllers/organizations.controller';

function createDriverService(existingPending?: unknown) {
  const createdRecords: unknown[] = [];
  const prisma = {
    driver: {
      findUnique: async () => ({ id: 'driver-1' }),
      update: async (args: unknown) => args,
    },
    kycRecord: {
      findFirst: async () => existingPending ?? null,
      create: async (args: any) => {
        const record = { id: 'kyc-1', ...args.data };
        createdRecords.push(record);
        return record;
      },
    },
  };
  return {
    service: new DriverService(prisma as any, {} as any, {} as any),
    createdRecords,
  };
}

async function main() {
  {
    const { service, createdRecords } = createDriverService();
    const result = await service.submitKyc('driver-1', {
      documentType: KycDocumentType.DRIVING_LICENSE,
      documentUrl: 'https://storage.pahadi.app/driver/driver-1/DRIVING_LICENSE/file.pdf',
      fileUuid: 'file-1',
      consentGiven: true,
    });
    assert.equal(createdRecords.length, 1, 'submitKyc should create one KycRecord');
    assert.equal(result.kycRecord.entityType, KycEntityType.DRIVER);
    assert.equal(result.kycRecord.entityId, 'driver-1');
    assert.equal(result.kycRecord.status, DocumentStatus.PENDING);
    assert.equal(result.kycRecord.documentType, KycDocumentType.DRIVING_LICENSE);
  }

  {
    const { service } = createDriverService({ id: 'kyc-existing' });
    await assert.rejects(
      () =>
        service.submitKyc('driver-1', {
          documentType: KycDocumentType.PAN_CARD,
          documentUrl: 'https://storage.pahadi.app/driver/driver-1/PAN_CARD/file.pdf',
        }),
      ConflictException,
      'submitKyc should reject duplicate pending submissions for the same document type',
    );
  }

  {
    const { service } = createDriverService();
    await assert.rejects(
      () =>
        service.submitKyc('driver-1', {
          documentType: 'PASSPORT' as KycDocumentType,
          documentUrl: 'https://storage.pahadi.app/driver/driver-1/PASSPORT/file.pdf',
        }),
      BadRequestException,
      'submitKyc should reject invalid KYC document types',
    );
  }

  {
    const where = buildOrganizationKycVisibilityWhere('org-1', ['driver-1'], ['vehicle-1']);
    assert.deepEqual(where.OR, [
      { entityType: KycEntityType.ORGANIZATION, entityId: 'org-1' },
      { entityType: KycEntityType.DRIVER, entityId: { in: ['driver-1'] } },
      { entityType: KycEntityType.VEHICLE, entityId: { in: ['vehicle-1'] } },
    ]);
  }

  console.log('driver.kyc contract tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
