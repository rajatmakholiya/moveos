import {
  AssignmentStatus,
  ComplianceStatus,
  DocumentStatus,
  DriverStatus,
  KycDocumentType,
  KycEntityType,
  KycStatus,
  OrganizationDriverStatus,
  OrganizationMemberRole,
  OrganizationMemberStatus,
  OrganizationStatus,
  OrgPlanTier,
  PrismaClient,
  TripStatus,
  UserRole,
  UserStatus,
  VehicleOwnershipType,
  VehicleStatus,
} from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function istDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const superAdmin = await prisma.user.upsert({
    where: { phone: '+919876543210' },
    update: {
      name: 'MoveOS Super Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      id: 'super_admin_dev',
      phone: '+919876543210',
      name: 'MoveOS Super Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { phone: '+919999900001' },
    update: {
      name: 'Dev Driver',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
    },
    create: {
      phone: '+919999900001',
      name: 'Dev Driver',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
    },
  });

  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {
      name: 'Dev Driver',
      status: DriverStatus.ONLINE,
      kycStatus: KycStatus.APPROVED,
      complianceStatus: ComplianceStatus.CLEAR,
    },
    create: {
      userId: driverUser.id,
      name: 'Dev Driver',
      status: DriverStatus.ONLINE,
      kycStatus: KycStatus.APPROVED,
      complianceStatus: ComplianceStatus.CLEAR,
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { plate: 'UK05TA1234' },
    update: {
      type: 'Bolero',
      status: VehicleStatus.ACTIVE,
      complianceStatus: ComplianceStatus.CLEAR,
    },
    create: {
      plate: 'UK05TA1234',
      type: 'Bolero',
      status: VehicleStatus.ACTIVE,
      complianceStatus: ComplianceStatus.CLEAR,
    },
  });

  await prisma.driverVehicleAssignment.upsert({
    where: { driverId_vehicleId: { driverId: driver.id, vehicleId: vehicle.id } },
    update: { active: true },
    create: { driverId: driver.id, vehicleId: vehicle.id, active: true },
  });

  await prisma.route.upsert({
    where: { id: 'pithoragarh-dehradun' },
    update: {
      name: 'Pithoragarh to Dehradun',
      originLabel: 'Pithoragarh',
      destinationLabel: 'Dehradun',
      distanceKm: 460,
      estimatedHours: 13,
      isActive: true,
      baseFrontPrice: 180000,
      baseBackPrice: 140000,
      fromCity: 'Pithoragarh',
      toCity: 'Dehradun',
      routeName: 'Pithoragarh to Dehradun',
      baseFarePaise: 140000,
      estimatedDurationMinutes: 780,
      status: 'ACTIVE',
    },
    create: {
      id: 'pithoragarh-dehradun',
      name: 'Pithoragarh to Dehradun',
      originLabel: 'Pithoragarh',
      destinationLabel: 'Dehradun',
      distanceKm: 460,
      estimatedHours: 13,
      isActive: true,
      baseFrontPrice: 180000,
      baseBackPrice: 140000,
      fromCity: 'Pithoragarh',
      toCity: 'Dehradun',
      routeName: 'Pithoragarh to Dehradun',
      baseFarePaise: 140000,
      estimatedDurationMinutes: 780,
      status: 'ACTIVE',
    },
  });

  await prisma.route.upsert({
    where: { id: 'dehradun-pithoragarh' },
    update: {
      name: 'Dehradun to Pithoragarh',
      originLabel: 'Dehradun',
      destinationLabel: 'Pithoragarh',
      distanceKm: 460,
      estimatedHours: 13,
      isActive: true,
      baseFrontPrice: 180000,
      baseBackPrice: 140000,
      fromCity: 'Dehradun',
      toCity: 'Pithoragarh',
      routeName: 'Dehradun to Pithoragarh',
      baseFarePaise: 140000,
      estimatedDurationMinutes: 780,
      status: 'ACTIVE',
    },
    create: {
      id: 'dehradun-pithoragarh',
      name: 'Dehradun to Pithoragarh',
      originLabel: 'Dehradun',
      destinationLabel: 'Pithoragarh',
      distanceKm: 460,
      estimatedHours: 13,
      isActive: true,
      baseFrontPrice: 180000,
      baseBackPrice: 140000,
      fromCity: 'Dehradun',
      toCity: 'Pithoragarh',
      routeName: 'Dehradun to Pithoragarh',
      baseFarePaise: 140000,
      estimatedDurationMinutes: 780,
      status: 'ACTIVE',
    },
  });

  const trips = [
    {
      id: 'dev-trip-pithoragarh-dehradun-2026-05-12-evening',
      routeId: 'pithoragarh-dehradun',
      departureAt: istDateTime('2026-05-12', '20:30'),
      departurePoint: 'Pithoragarh Bus Stand',
      notes: 'Evening shared ride',
    },
    {
      id: 'dev-trip-pithoragarh-dehradun-2026-05-13-morning',
      routeId: 'pithoragarh-dehradun',
      departureAt: istDateTime('2026-05-13', '07:30'),
      departurePoint: 'Pithoragarh Bus Stand',
      notes: 'Morning shared ride',
    },
    {
      id: 'dev-trip-dehradun-pithoragarh-2026-05-13-evening',
      routeId: 'dehradun-pithoragarh',
      departureAt: istDateTime('2026-05-13', '18:00'),
      departurePoint: 'ISBT Dehradun',
      notes: 'Return shared ride',
    },
  ];

  for (const trip of trips) {
    await prisma.scheduledTrip.upsert({
      where: { id: trip.id },
      update: {
        routeId: trip.routeId,
        driverId: driver.id,
        vehicleId: vehicle.id,
        departureAt: trip.departureAt,
        frontSeatsTotal: 1,
        backSeatsTotal: 4,
        status: TripStatus.OPEN,
        departurePoint: trip.departurePoint,
        luggagePolicy: 'Small luggage included. Large luggage may cost extra.',
        notes: trip.notes,
      },
      create: {
        id: trip.id,
        routeId: trip.routeId,
        driverId: driver.id,
        vehicleId: vehicle.id,
        departureAt: trip.departureAt,
        frontSeatsTotal: 1,
        backSeatsTotal: 4,
        status: TripStatus.OPEN,
        departurePoint: trip.departurePoint,
        luggagePolicy: 'Small luggage included. Large luggage may cost extra.',
        notes: trip.notes,
      },
    });
  }

  const organizations = [
    {
      id: 'org-himalayan-fleet',
      legalName: 'Himalayan Mobility Partners Pvt Ltd',
      tradeName: 'Himalayan Fleet',
      status: OrganizationStatus.ACTIVE,
      planTier: OrgPlanTier.GROWTH,
      gstin: '05AAHCH1234Q1Z7',
      pan: 'AAHCH1234Q',
      registrationNo: 'U60200UK2024PTC123456',
      primaryPhone: '+919876540010',
      primaryEmail: 'ops@himalayanfleet.example',
      addressJson: {
        line1: 'Mall Road Fleet Office',
        city: 'Pithoragarh',
        state: 'Uttarakhand',
        postalCode: '262501',
        country: 'IN',
      },
      operatingRegions: ['Pithoragarh', 'Dehradun', 'Haldwani', 'Almora'],
      metadataJson: {
        billingCycle: 'monthly',
        defaultSettlementMode: 'bank_transfer',
        notes: 'Primary beta fleet for shared hill routes.',
      },
      owner: {
        id: 'org-owner-himalayan',
        phone: '+919876540010',
        name: 'Aarav Rawat',
        email: 'aarav.rawat@himalayanfleet.example',
      },
      drivers: [
        {
          driverId: 'driver-org-mohan',
          userId: 'user-driver-org-mohan',
          phone: '+919876540101',
          name: 'Mohan Bisht',
          email: 'mohan.bisht@himalayanfleet.example',
          status: DriverStatus.ONLINE,
          kycStatus: KycStatus.APPROVED,
          complianceStatus: ComplianceStatus.CLEAR,
          organizationStatus: OrganizationDriverStatus.ACTIVE,
        },
        {
          driverId: 'driver-org-kavita',
          userId: 'user-driver-org-kavita',
          phone: '+919876540102',
          name: 'Kavita Pandey',
          email: 'kavita.pandey@himalayanfleet.example',
          status: DriverStatus.OFFLINE,
          kycStatus: KycStatus.PENDING,
          complianceStatus: ComplianceStatus.CLEAR,
          organizationStatus: OrganizationDriverStatus.PENDING_COMPLIANCE,
        },
      ],
      vehicles: [
        {
          id: 'vehicle-org-uk05ta4321',
          plate: 'UK05TA4321',
          type: 'Bolero',
          status: VehicleStatus.ACTIVE,
          complianceStatus: ComplianceStatus.CLEAR,
          ownershipType: VehicleOwnershipType.ORGANIZATION,
        },
        {
          id: 'vehicle-org-uk05ta6789',
          plate: 'UK05TA6789',
          type: 'Traveller',
          status: VehicleStatus.INACTIVE,
          complianceStatus: ComplianceStatus.CLEAR,
          ownershipType: VehicleOwnershipType.LEASED,
        },
      ],
      assignments: [
        {
          driverId: 'driver-org-mohan',
          vehiclePlate: 'UK05TA4321',
          status: AssignmentStatus.ACTIVE,
          active: true,
          source: 'ORG_ADMIN',
          startsAt: istDateTime('2026-05-01', '09:00'),
          endsAt: null,
          policyJson: { shiftType: 'full_day', routePreference: 'pithoragarh-dehradun' },
        },
        {
          driverId: 'driver-org-kavita',
          vehiclePlate: 'UK05TA6789',
          status: AssignmentStatus.PENDING_COMPLIANCE,
          active: false,
          source: 'ORG_ADMIN',
          startsAt: istDateTime('2026-05-24', '07:00'),
          endsAt: istDateTime('2026-06-24', '19:00'),
          policyJson: { shiftType: 'trial', requiresComplianceReview: true },
        },
      ],
      documents: [
        {
          id: 'org-doc-himalayan-gst',
          type: KycDocumentType.GST_CERTIFICATE,
          status: DocumentStatus.APPROVED,
          url: 'https://storage.moveos.local/docs/himalayan/gst.pdf',
        },
        {
          id: 'org-doc-himalayan-pan',
          type: KycDocumentType.PAN_CARD,
          status: DocumentStatus.APPROVED,
          url: 'https://storage.moveos.local/docs/himalayan/pan.pdf',
        },
        {
          id: 'org-doc-himalayan-bank',
          type: KycDocumentType.BANK_ACCOUNT,
          status: DocumentStatus.PENDING,
          url: 'https://storage.moveos.local/docs/himalayan/bank.pdf',
        },
      ],
      invitations: [
        {
          id: 'org-invite-himalayan-driver',
          phone: '+919876540199',
          role: OrganizationMemberRole.DRIVER,
          inviteToken: 'himalayan-driver-invite-dev',
          status: 'INVITED',
          expiresAt: istDateTime('2026-06-30', '23:59'),
        },
      ],
    },
    {
      id: 'org-kumaon-rides',
      legalName: 'Kumaon Valley Rides LLP',
      tradeName: 'Kumaon Rides',
      status: OrganizationStatus.PENDING_REVIEW,
      planTier: OrgPlanTier.SOLO,
      gstin: '05AAKCK9876L1Z3',
      pan: 'AAKCK9876L',
      registrationNo: 'AAK-2468',
      primaryPhone: '+919876550010',
      primaryEmail: 'hello@kumaonrides.example',
      addressJson: {
        line1: 'Station Road',
        city: 'Haldwani',
        state: 'Uttarakhand',
        postalCode: '263139',
        country: 'IN',
      },
      operatingRegions: ['Haldwani', 'Nainital', 'Almora'],
      metadataJson: {
        billingCycle: 'prepaid',
        notes: 'Awaiting document verification before activating dispatch.',
      },
      owner: {
        id: 'org-owner-kumaon',
        phone: '+919876550010',
        name: 'Nisha Joshi',
        email: 'nisha.joshi@kumaonrides.example',
      },
      drivers: [
        {
          driverId: 'driver-org-deepak',
          userId: 'user-driver-org-deepak',
          phone: '+919876550101',
          name: 'Deepak Bora',
          email: 'deepak.bora@kumaonrides.example',
          status: DriverStatus.OFFLINE,
          kycStatus: KycStatus.PENDING,
          complianceStatus: ComplianceStatus.CLEAR,
          organizationStatus: OrganizationDriverStatus.PENDING_COMPLIANCE,
        },
      ],
      vehicles: [
        {
          id: 'vehicle-org-uk04ta2468',
          plate: 'UK04TA2468',
          type: 'Dzire',
          status: VehicleStatus.INACTIVE,
          complianceStatus: ComplianceStatus.CLEAR,
          ownershipType: VehicleOwnershipType.ORGANIZATION,
        },
      ],
      assignments: [
        {
          driverId: 'driver-org-deepak',
          vehiclePlate: 'UK04TA2468',
          status: AssignmentStatus.PENDING_COMPLIANCE,
          active: false,
          source: 'ORG_ONBOARDING',
          startsAt: istDateTime('2026-05-27', '08:00'),
          endsAt: null,
          policyJson: { shiftType: 'day', requiresComplianceReview: true },
        },
      ],
      documents: [
        {
          id: 'org-doc-kumaon-gst',
          type: KycDocumentType.GST_CERTIFICATE,
          status: DocumentStatus.PENDING,
          url: 'https://storage.moveos.local/docs/kumaon/gst.pdf',
        },
        {
          id: 'org-doc-kumaon-pan',
          type: KycDocumentType.PAN_CARD,
          status: DocumentStatus.PENDING,
          url: 'https://storage.moveos.local/docs/kumaon/pan.pdf',
        },
      ],
      invitations: [
        {
          id: 'org-invite-kumaon-fleet-manager',
          phone: '+919876550020',
          role: OrganizationMemberRole.FLEET_MANAGER,
          inviteToken: 'kumaon-fleet-manager-invite-dev',
          status: 'INVITED',
          expiresAt: istDateTime('2026-06-30', '23:59'),
        },
      ],
    },
  ];

  for (const org of organizations) {
    const ownerUser = await prisma.user.upsert({
      where: { phone: org.owner.phone },
      update: {
        name: org.owner.name,
        email: org.owner.email,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      create: {
        id: org.owner.id,
        phone: org.owner.phone,
        name: org.owner.name,
        email: org.owner.email,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    await prisma.organization.upsert({
      where: { id: org.id },
      update: {
        legalName: org.legalName,
        tradeName: org.tradeName,
        status: org.status,
        planTier: org.planTier,
        gstin: org.gstin,
        pan: org.pan,
        registrationNo: org.registrationNo,
        primaryPhone: org.primaryPhone,
        primaryEmail: org.primaryEmail,
        addressJson: org.addressJson,
        operatingRegions: org.operatingRegions,
        metadataJson: org.metadataJson,
        reviewedAt: org.status === OrganizationStatus.ACTIVE ? istDateTime('2026-05-10', '11:30') : null,
        reviewedById: org.status === OrganizationStatus.ACTIVE ? superAdmin.id : null,
        createdById: ownerUser.id,
      },
      create: {
        id: org.id,
        legalName: org.legalName,
        tradeName: org.tradeName,
        status: org.status,
        planTier: org.planTier,
        gstin: org.gstin,
        pan: org.pan,
        registrationNo: org.registrationNo,
        primaryPhone: org.primaryPhone,
        primaryEmail: org.primaryEmail,
        addressJson: org.addressJson,
        operatingRegions: org.operatingRegions,
        metadataJson: org.metadataJson,
        reviewedAt: org.status === OrganizationStatus.ACTIVE ? istDateTime('2026-05-10', '11:30') : null,
        reviewedById: org.status === OrganizationStatus.ACTIVE ? superAdmin.id : null,
        createdById: ownerUser.id,
      },
    });

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: ownerUser.id } },
      update: {
        role: OrganizationMemberRole.OWNER,
        status: OrganizationMemberStatus.ACTIVE,
        invitedById: superAdmin.id,
      },
      create: {
        organizationId: org.id,
        userId: ownerUser.id,
        role: OrganizationMemberRole.OWNER,
        status: OrganizationMemberStatus.ACTIVE,
        invitedById: superAdmin.id,
      },
    });

    await prisma.kycRecord.upsert({
      where: { id: `kyc-${org.id}-gst` },
      update: {
        entityType: KycEntityType.ORGANIZATION,
        entityId: org.id,
        documentType: KycDocumentType.GST_CERTIFICATE,
        documentUrl: org.documents[0].url,
        documentNo: org.gstin,
        status: org.status === OrganizationStatus.ACTIVE ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
        reviewedAt: org.status === OrganizationStatus.ACTIVE ? istDateTime('2026-05-10', '11:25') : null,
        reviewedById: org.status === OrganizationStatus.ACTIVE ? superAdmin.id : null,
        metadataJson: { source: 'seed', legalName: org.legalName },
      },
      create: {
        id: `kyc-${org.id}-gst`,
        entityType: KycEntityType.ORGANIZATION,
        entityId: org.id,
        documentType: KycDocumentType.GST_CERTIFICATE,
        documentUrl: org.documents[0].url,
        documentNo: org.gstin,
        status: org.status === OrganizationStatus.ACTIVE ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
        reviewedAt: org.status === OrganizationStatus.ACTIVE ? istDateTime('2026-05-10', '11:25') : null,
        reviewedById: org.status === OrganizationStatus.ACTIVE ? superAdmin.id : null,
        metadataJson: { source: 'seed', legalName: org.legalName },
      },
    });

    for (const document of org.documents) {
      await prisma.organizationDocument.upsert({
        where: { id: document.id },
        update: {
          organizationId: org.id,
          type: document.type,
          url: document.url,
          status: document.status,
          reviewedAt: document.status === DocumentStatus.APPROVED ? istDateTime('2026-05-10', '11:20') : null,
          reviewedById: document.status === DocumentStatus.APPROVED ? superAdmin.id : null,
          rejectionNote: null,
        },
        create: {
          id: document.id,
          organizationId: org.id,
          type: document.type,
          url: document.url,
          status: document.status,
          reviewedAt: document.status === DocumentStatus.APPROVED ? istDateTime('2026-05-10', '11:20') : null,
          reviewedById: document.status === DocumentStatus.APPROVED ? superAdmin.id : null,
          rejectionNote: null,
        },
      });
    }

    const driverById = new Map<string, string>();

    for (const orgDriver of org.drivers) {
      const user = await prisma.user.upsert({
        where: { phone: orgDriver.phone },
        update: {
          name: orgDriver.name,
          email: orgDriver.email,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
        },
        create: {
          id: orgDriver.userId,
          phone: orgDriver.phone,
          name: orgDriver.name,
          email: orgDriver.email,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
        },
      });

      const seededDriver = await prisma.driver.upsert({
        where: { userId: user.id },
        update: {
          name: orgDriver.name,
          status: orgDriver.status,
          kycStatus: orgDriver.kycStatus,
          complianceStatus: orgDriver.complianceStatus,
        },
        create: {
          id: orgDriver.driverId,
          userId: user.id,
          name: orgDriver.name,
          status: orgDriver.status,
          kycStatus: orgDriver.kycStatus,
          complianceStatus: orgDriver.complianceStatus,
        },
      });

      driverById.set(orgDriver.driverId, seededDriver.id);

      await prisma.organizationDriver.upsert({
        where: { organizationId_driverId: { organizationId: org.id, driverId: seededDriver.id } },
        update: {
          status: orgDriver.organizationStatus,
          invitedById: ownerUser.id,
          acceptedAt: orgDriver.organizationStatus === OrganizationDriverStatus.ACTIVE ? istDateTime('2026-05-11', '09:15') : null,
          startedAt: orgDriver.organizationStatus === OrganizationDriverStatus.ACTIVE ? istDateTime('2026-05-11', '09:30') : null,
          endedAt: null,
          metadataJson: { source: 'seed', onboardingPath: 'organization' },
        },
        create: {
          organizationId: org.id,
          driverId: seededDriver.id,
          status: orgDriver.organizationStatus,
          invitedById: ownerUser.id,
          acceptedAt: orgDriver.organizationStatus === OrganizationDriverStatus.ACTIVE ? istDateTime('2026-05-11', '09:15') : null,
          startedAt: orgDriver.organizationStatus === OrganizationDriverStatus.ACTIVE ? istDateTime('2026-05-11', '09:30') : null,
          metadataJson: { source: 'seed', onboardingPath: 'organization' },
        },
      });

      await prisma.driverDocument.upsert({
        where: { id: `driver-doc-${orgDriver.driverId}-license` },
        update: {
          driverId: seededDriver.id,
          type: KycDocumentType.DRIVING_LICENSE,
          url: `https://storage.moveos.local/docs/drivers/${orgDriver.driverId}/license.pdf`,
          status: orgDriver.kycStatus === KycStatus.APPROVED ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2028-12-31', '23:59'),
        },
        create: {
          id: `driver-doc-${orgDriver.driverId}-license`,
          driverId: seededDriver.id,
          type: KycDocumentType.DRIVING_LICENSE,
          url: `https://storage.moveos.local/docs/drivers/${orgDriver.driverId}/license.pdf`,
          status: orgDriver.kycStatus === KycStatus.APPROVED ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2028-12-31', '23:59'),
        },
      });

      await prisma.kycRecord.upsert({
        where: { id: `kyc-${orgDriver.driverId}-license` },
        update: {
          entityType: KycEntityType.DRIVER,
          entityId: seededDriver.id,
          documentType: KycDocumentType.DRIVING_LICENSE,
          documentUrl: `https://storage.moveos.local/docs/drivers/${orgDriver.driverId}/license.pdf`,
          documentNo: `DL-${orgDriver.phone.slice(-4)}-${orgDriver.driverId.slice(-4).toUpperCase()}`,
          status: orgDriver.kycStatus === KycStatus.APPROVED ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2028-12-31', '23:59'),
          reviewedAt: orgDriver.kycStatus === KycStatus.APPROVED ? istDateTime('2026-05-11', '10:00') : null,
          reviewedById: orgDriver.kycStatus === KycStatus.APPROVED ? superAdmin.id : null,
          metadataJson: { source: 'seed', driverName: orgDriver.name },
        },
        create: {
          id: `kyc-${orgDriver.driverId}-license`,
          entityType: KycEntityType.DRIVER,
          entityId: seededDriver.id,
          documentType: KycDocumentType.DRIVING_LICENSE,
          documentUrl: `https://storage.moveos.local/docs/drivers/${orgDriver.driverId}/license.pdf`,
          documentNo: `DL-${orgDriver.phone.slice(-4)}-${orgDriver.driverId.slice(-4).toUpperCase()}`,
          status: orgDriver.kycStatus === KycStatus.APPROVED ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2028-12-31', '23:59'),
          reviewedAt: orgDriver.kycStatus === KycStatus.APPROVED ? istDateTime('2026-05-11', '10:00') : null,
          reviewedById: orgDriver.kycStatus === KycStatus.APPROVED ? superAdmin.id : null,
          metadataJson: { source: 'seed', driverName: orgDriver.name },
        },
      });
    }

    const vehicleByPlate = new Map<string, string>();

    for (const orgVehicle of org.vehicles) {
      const seededVehicle = await prisma.vehicle.upsert({
        where: { plate: orgVehicle.plate },
        update: {
          type: orgVehicle.type,
          status: orgVehicle.status,
          complianceStatus: orgVehicle.complianceStatus,
          ownershipType: orgVehicle.ownershipType,
        },
        create: {
          id: orgVehicle.id,
          plate: orgVehicle.plate,
          type: orgVehicle.type,
          status: orgVehicle.status,
          complianceStatus: orgVehicle.complianceStatus,
          ownershipType: orgVehicle.ownershipType,
        },
      });

      vehicleByPlate.set(orgVehicle.plate, seededVehicle.id);

      await prisma.organizationVehicle.upsert({
        where: { organizationId_vehicleId: { organizationId: org.id, vehicleId: seededVehicle.id } },
        update: {
          ownershipType: orgVehicle.ownershipType,
          status: orgVehicle.status === VehicleStatus.ACTIVE ? 'ACTIVE' : 'PENDING_COMPLIANCE',
          endedAt: null,
          metadataJson: { source: 'seed', plate: orgVehicle.plate },
        },
        create: {
          organizationId: org.id,
          vehicleId: seededVehicle.id,
          ownershipType: orgVehicle.ownershipType,
          status: orgVehicle.status === VehicleStatus.ACTIVE ? 'ACTIVE' : 'PENDING_COMPLIANCE',
          metadataJson: { source: 'seed', plate: orgVehicle.plate },
        },
      });

      await prisma.vehicleDocument.upsert({
        where: { id: `vehicle-doc-${orgVehicle.plate.toLowerCase()}-rc` },
        update: {
          vehicleId: seededVehicle.id,
          type: KycDocumentType.VEHICLE_REGISTRATION,
          url: `https://storage.moveos.local/docs/vehicles/${orgVehicle.plate.toLowerCase()}/rc.pdf`,
          status: orgVehicle.status === VehicleStatus.ACTIVE ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2031-12-31', '23:59'),
        },
        create: {
          id: `vehicle-doc-${orgVehicle.plate.toLowerCase()}-rc`,
          vehicleId: seededVehicle.id,
          type: KycDocumentType.VEHICLE_REGISTRATION,
          url: `https://storage.moveos.local/docs/vehicles/${orgVehicle.plate.toLowerCase()}/rc.pdf`,
          status: orgVehicle.status === VehicleStatus.ACTIVE ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2031-12-31', '23:59'),
        },
      });

      await prisma.kycRecord.upsert({
        where: { id: `kyc-${orgVehicle.plate.toLowerCase()}-rc` },
        update: {
          entityType: KycEntityType.VEHICLE,
          entityId: seededVehicle.id,
          documentType: KycDocumentType.VEHICLE_REGISTRATION,
          documentUrl: `https://storage.moveos.local/docs/vehicles/${orgVehicle.plate.toLowerCase()}/rc.pdf`,
          documentNo: orgVehicle.plate,
          status: orgVehicle.status === VehicleStatus.ACTIVE ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2031-12-31', '23:59'),
          reviewedAt: orgVehicle.status === VehicleStatus.ACTIVE ? istDateTime('2026-05-11', '10:30') : null,
          reviewedById: orgVehicle.status === VehicleStatus.ACTIVE ? superAdmin.id : null,
          metadataJson: { source: 'seed', vehicleType: orgVehicle.type },
        },
        create: {
          id: `kyc-${orgVehicle.plate.toLowerCase()}-rc`,
          entityType: KycEntityType.VEHICLE,
          entityId: seededVehicle.id,
          documentType: KycDocumentType.VEHICLE_REGISTRATION,
          documentUrl: `https://storage.moveos.local/docs/vehicles/${orgVehicle.plate.toLowerCase()}/rc.pdf`,
          documentNo: orgVehicle.plate,
          status: orgVehicle.status === VehicleStatus.ACTIVE ? DocumentStatus.APPROVED : DocumentStatus.PENDING,
          expiresAt: istDateTime('2031-12-31', '23:59'),
          reviewedAt: orgVehicle.status === VehicleStatus.ACTIVE ? istDateTime('2026-05-11', '10:30') : null,
          reviewedById: orgVehicle.status === VehicleStatus.ACTIVE ? superAdmin.id : null,
          metadataJson: { source: 'seed', vehicleType: orgVehicle.type },
        },
      });
    }

    for (const assignment of org.assignments) {
      const assignedDriverId = driverById.get(assignment.driverId);
      const assignedVehicleId = vehicleByPlate.get(assignment.vehiclePlate);

      if (!assignedDriverId || !assignedVehicleId) {
        throw new Error(`Missing seeded driver or vehicle for assignment ${assignment.driverId}/${assignment.vehiclePlate}`);
      }

      await prisma.driverVehicleAssignment.upsert({
        where: { driverId_vehicleId: { driverId: assignedDriverId, vehicleId: assignedVehicleId } },
        update: {
          organizationId: org.id,
          assignedByUserId: ownerUser.id,
          status: assignment.status,
          startsAt: assignment.startsAt,
          endsAt: assignment.endsAt,
          source: assignment.source,
          policyJson: assignment.policyJson,
          active: assignment.active,
        },
        create: {
          driverId: assignedDriverId,
          vehicleId: assignedVehicleId,
          organizationId: org.id,
          assignedByUserId: ownerUser.id,
          status: assignment.status,
          startsAt: assignment.startsAt,
          endsAt: assignment.endsAt,
          source: assignment.source,
          policyJson: assignment.policyJson,
          active: assignment.active,
        },
      });
    }

    for (const invitation of org.invitations) {
      await prisma.organizationInvitation.upsert({
        where: { id: invitation.id },
        update: {
          organizationId: org.id,
          phone: invitation.phone,
          role: invitation.role,
          inviteTokenHash: hash(invitation.inviteToken),
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdByUserId: ownerUser.id,
        },
        create: {
          id: invitation.id,
          organizationId: org.id,
          phone: invitation.phone,
          role: invitation.role,
          inviteTokenHash: hash(invitation.inviteToken),
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdByUserId: ownerUser.id,
        },
      });
    }

    await prisma.auditEvent.upsert({
      where: { id: `audit-${org.id}-created` },
      update: {
        actorUserId: ownerUser.id,
        organizationId: org.id,
        targetType: 'ORGANIZATION',
        targetId: org.id,
        action: 'CREATED',
        afterJson: { status: OrganizationStatus.DRAFT, legalName: org.legalName },
        reason: 'Seeded organization onboarding fixture',
      },
      create: {
        id: `audit-${org.id}-created`,
        actorUserId: ownerUser.id,
        organizationId: org.id,
        targetType: 'ORGANIZATION',
        targetId: org.id,
        action: 'CREATED',
        afterJson: { status: OrganizationStatus.DRAFT, legalName: org.legalName },
        reason: 'Seeded organization onboarding fixture',
      },
    });

    await prisma.auditEvent.upsert({
      where: { id: `audit-${org.id}-${org.status.toLowerCase()}` },
      update: {
        actorUserId: org.status === OrganizationStatus.ACTIVE ? superAdmin.id : ownerUser.id,
        organizationId: org.id,
        targetType: 'ORGANIZATION',
        targetId: org.id,
        action: org.status === OrganizationStatus.ACTIVE ? 'APPROVED' : 'SUBMITTED_FOR_REVIEW',
        beforeJson: { status: OrganizationStatus.DRAFT },
        afterJson: { status: org.status },
        reason: org.status === OrganizationStatus.ACTIVE ? 'Approved for dispatch operations' : 'Submitted with pending compliance documents',
      },
      create: {
        id: `audit-${org.id}-${org.status.toLowerCase()}`,
        actorUserId: org.status === OrganizationStatus.ACTIVE ? superAdmin.id : ownerUser.id,
        organizationId: org.id,
        targetType: 'ORGANIZATION',
        targetId: org.id,
        action: org.status === OrganizationStatus.ACTIVE ? 'APPROVED' : 'SUBMITTED_FOR_REVIEW',
        beforeJson: { status: OrganizationStatus.DRAFT },
        afterJson: { status: org.status },
        reason: org.status === OrganizationStatus.ACTIVE ? 'Approved for dispatch operations' : 'Submitted with pending compliance documents',
      },
    });
  }

  // ── Transport requests (SEAT / FULL_VEHICLE / PARCEL marketplace) ──────────
  // Previously hardcoded inside dispatch-service; now persisted like real data.
  const pithoragarhPlace = { id: 'geo-pth-bus', label: 'Pithoragarh Bus Stand', address: 'Roadways Station, Pithoragarh', city: 'Pithoragarh', lat: 29.5829, lng: 80.2182 };
  const dehradunPlace = { id: 'geo-ddn-isbt', label: 'ISBT Dehradun', address: 'Transport Nagar, Dehradun', city: 'Dehradun', lat: 30.2908, lng: 78.0007 };
  const transportRequests = [
    {
      id: 'req-seat-1001',
      type: 'SEAT' as const,
      routeId: 'pithoragarh-dehradun',
      fromLabel: 'Pithoragarh',
      toLabel: 'Dehradun',
      passengerName: 'Kavita Joshi',
      passengerPhone: '+91 98765 43210',
      seats: 2,
      note: 'Can join from Siltham or bus stand.',
    },
    {
      id: 'req-full-2001',
      type: 'FULL_VEHICLE' as const,
      routeId: 'pithoragarh-dehradun',
      fromLabel: 'Pithoragarh',
      toLabel: 'Dehradun',
      passengerName: 'Mehra family',
      passengerPhone: '+91 99887 76655',
      seats: 5,
      budgetPaise: 1150000,
    },
    {
      id: 'req-parcel-3001',
      type: 'PARCEL' as const,
      routeId: 'pithoragarh-haldwani',
      fromLabel: 'Pithoragarh',
      toLabel: 'Haldwani',
      passengerName: 'Sharma Store',
      passengerPhone: '+91 91234 56789',
      seats: 0,
      parcelDetails: '2 sealed medicine cartons',
      budgetPaise: 90000,
    },
  ];
  for (const request of transportRequests) {
    await prisma.transportRequest.upsert({
      where: { id: request.id },
      update: {},
      create: {
        ...request,
        pickupJson: pithoragarhPlace,
        dropoffJson: request.toLabel === 'Dehradun' ? dehradunPlace : { ...dehradunPlace, label: `${request.toLabel} drop point`, city: request.toLabel },
        requestedFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
