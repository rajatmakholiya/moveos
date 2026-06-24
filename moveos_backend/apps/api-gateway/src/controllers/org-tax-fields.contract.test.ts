import 'reflect-metadata';
import { strict as assert } from 'assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateOrganizationDetailsDto, CreateAdminOrganizationDto } from '../dto/organizations.dto';

// Client-side GSTIN/PAN regex — kept in sync with the frontend validateTaxFields function.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function clientValidateTaxFields(form: { gstin?: string; pan?: string; taxId?: string; registrationNo?: string }): string {
  const gstin = form.gstin?.trim().toUpperCase();
  const pan = form.pan?.trim().toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) return 'GSTIN must be a valid 15-character Indian GST number.';
  if (pan && !PAN_RE.test(pan)) return 'PAN must be a valid 10-character Indian PAN.';
  if (form.taxId && form.taxId.trim().length > 32) return 'Tax ID must be 32 characters or fewer.';
  if (form.registrationNo && form.registrationNo.trim().length > 64) return 'Registration number must be 64 characters or fewer.';
  return '';
}

void (async () => {
  // ── Client-side validation ────────────────────────────────────────────────

  // Valid GSTIN passes
  assert.equal(clientValidateTaxFields({ gstin: '05ABCDE1234F1Z5' }), '', 'valid GSTIN should pass');

  // Invalid GSTIN fails
  assert.notEqual(clientValidateTaxFields({ gstin: 'INVALID' }), '', 'invalid GSTIN should fail');
  assert.notEqual(clientValidateTaxFields({ gstin: '05ABCDE1234F1Z' }), '', 'short GSTIN should fail');

  // Valid PAN passes
  assert.equal(clientValidateTaxFields({ pan: 'ABCDE1234F' }), '', 'valid PAN should pass');

  // Invalid PAN fails
  assert.notEqual(clientValidateTaxFields({ pan: 'ABC12' }), '', 'short PAN should fail');
  assert.notEqual(clientValidateTaxFields({ pan: '12345ABCDE' }), '', 'PAN starting with digits should fail');

  // taxId length
  assert.equal(clientValidateTaxFields({ taxId: 'A'.repeat(32) }), '', 'taxId at max length should pass');
  assert.notEqual(clientValidateTaxFields({ taxId: 'A'.repeat(33) }), '', 'taxId over max length should fail');

  // registrationNo length
  assert.equal(clientValidateTaxFields({ registrationNo: 'A'.repeat(64) }), '', 'registrationNo at max length should pass');
  assert.notEqual(clientValidateTaxFields({ registrationNo: 'A'.repeat(65) }), '', 'registrationNo over max length should fail');

  // Empty fields pass (all optional)
  assert.equal(clientValidateTaxFields({}), '', 'empty form should pass');

  // ── Backend DTO: UpdateOrganizationDetailsDto ─────────────────────────────

  // Valid taxId and registrationNo pass
  const validDto = plainToInstance(UpdateOrganizationDetailsDto, { taxId: 'LOC-TAX-001', registrationNo: 'REG/2024/001' });
  const validErrors = await validate(validDto);
  assert.equal(validErrors.length, 0, 'valid taxId + registrationNo should pass DTO validation');

  // taxId over 32 chars fails
  const longTaxId = plainToInstance(UpdateOrganizationDetailsDto, { taxId: 'A'.repeat(33) });
  const longTaxIdErrors = await validate(longTaxId);
  assert.ok(longTaxIdErrors.some((e) => e.property === 'taxId'), 'taxId > 32 chars should fail DTO validation');

  // registrationNo over 64 chars fails
  const longRegNo = plainToInstance(UpdateOrganizationDetailsDto, { registrationNo: 'A'.repeat(65) });
  const longRegNoErrors = await validate(longRegNo);
  assert.ok(longRegNoErrors.some((e) => e.property === 'registrationNo'), 'registrationNo > 64 chars should fail DTO validation');

  // All fields optional — empty object is valid
  const emptyDto = plainToInstance(UpdateOrganizationDetailsDto, {});
  const emptyErrors = await validate(emptyDto);
  assert.equal(emptyErrors.length, 0, 'empty UpdateOrganizationDetailsDto should be valid');

  // ── Backend DTO: CreateAdminOrganizationDto ───────────────────────────────

  // taxId/registrationNo optional in create DTO
  const createDto = plainToInstance(CreateAdminOrganizationDto, {
    legalName: 'Pahadi Rides Pvt Ltd',
    ownerPhone: '+919876540001',
    taxId: 'LOC-TAX-999',
    registrationNo: 'REG/2024/999',
  });
  const createErrors = await validate(createDto);
  assert.equal(createErrors.length, 0, 'CreateAdminOrganizationDto with tax fields should pass');

  // taxId over 32 chars fails in create DTO too
  const createLongTax = plainToInstance(CreateAdminOrganizationDto, {
    legalName: 'Test Org',
    ownerPhone: '+919876540002',
    taxId: 'A'.repeat(33),
  });
  const createLongErrors = await validate(createLongTax);
  assert.ok(createLongErrors.some((e) => e.property === 'taxId'), 'CreateAdminOrganizationDto taxId > 32 chars should fail');

  console.log('org-tax-fields contract tests passed');
})();
