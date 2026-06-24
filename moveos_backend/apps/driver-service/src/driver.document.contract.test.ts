import { strict as assert } from 'assert';
import { validate } from 'class-validator';
import { VehicleDocumentDto, DriverDocumentDto, DocumentUploadRequestDto } from './dto/driver.dto';

async function errors(dto: object): Promise<string[]> {
  const result = await validate(dto);
  return result.flatMap((e) => Object.values(e.constraints ?? {}));
}

async function main() {
  // ---- VehicleDocumentDto ----

  // Reject: missing url entirely
  {
    const dto = Object.assign(new VehicleDocumentDto(), { type: 'RC' });
    const errs = await errors(dto);
    assert.ok(errs.length > 0, 'Should reject VehicleDocumentDto with missing url');
    assert.ok(
      errs.some((msg) => /url/i.test(msg)),
      `Error message should mention 'url', got: ${errs.join(', ')}`,
    );
  }

  // Reject: url is an empty string
  {
    const dto = Object.assign(new VehicleDocumentDto(), { type: 'RC', url: '' });
    const errs = await errors(dto);
    assert.ok(errs.length > 0, 'Should reject empty url');
  }

  // Reject: url is not a valid URL
  {
    const dto = Object.assign(new VehicleDocumentDto(), { type: 'RC', url: 'not-a-url' });
    const errs = await errors(dto);
    assert.ok(errs.length > 0, 'Should reject malformed url');
  }

  // Reject: missing type
  {
    const dto = Object.assign(new VehicleDocumentDto(), { url: 'https://storage.pahadi.app/v/123/RC/abc/file.pdf' });
    const errs = await errors(dto);
    assert.ok(errs.length > 0, 'Should reject VehicleDocumentDto with missing type');
  }

  // Accept: valid type + https url
  {
    const dto = Object.assign(new VehicleDocumentDto(), {
      type: 'RC',
      url: 'https://storage.pahadi.app/vehicle/v123/RC/abc123/rc.pdf',
    });
    const errs = await errors(dto);
    assert.equal(errs.length, 0, `VehicleDocumentDto should accept valid data, got: ${errs.join(', ')}`);
  }

  // ---- DriverDocumentDto ----

  // Reject: missing url
  {
    const dto = Object.assign(new DriverDocumentDto(), { type: 'LICENSE' });
    const errs = await errors(dto);
    assert.ok(errs.length > 0, 'Should reject DriverDocumentDto with missing url');
  }

  // Accept: valid type + url
  {
    const dto = Object.assign(new DriverDocumentDto(), {
      type: 'LICENSE',
      url: 'https://storage.pahadi.app/driver/d123/LICENSE/abc123/license.jpg',
    });
    const errs = await errors(dto);
    assert.equal(errs.length, 0, `DriverDocumentDto should accept valid data, got: ${errs.join(', ')}`);
  }

  // ---- DocumentUploadRequestDto ----

  // Accept: type only (filename is optional)
  {
    const dto = Object.assign(new DocumentUploadRequestDto(), { type: 'RC' });
    const errs = await errors(dto);
    assert.equal(errs.length, 0, `DocumentUploadRequestDto should accept type-only, got: ${errs.join(', ')}`);
  }

  // Accept: type + filename
  {
    const dto = Object.assign(new DocumentUploadRequestDto(), { type: 'RC', filename: 'rc-scan.pdf' });
    const errs = await errors(dto);
    assert.equal(errs.length, 0, `DocumentUploadRequestDto should accept type+filename, got: ${errs.join(', ')}`);
  }

  // Reject: missing type
  {
    const dto = Object.assign(new DocumentUploadRequestDto(), {});
    const errs = await errors(dto);
    assert.ok(errs.length > 0, 'DocumentUploadRequestDto should reject missing type');
  }

  console.log('driver.document contract tests passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
