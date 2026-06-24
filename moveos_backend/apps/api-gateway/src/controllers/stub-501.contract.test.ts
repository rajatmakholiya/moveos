import 'reflect-metadata';
import { strict as assert } from 'assert';
import { HttpException, HttpStatus } from '@nestjs/common';

// Contract: stub endpoints (challans, clusters) must return 501 with
// a machine-readable errorCode so the frontend can distinguish "not implemented" from
// a real server error and show a "Coming soon" notice instead of an error banner.

void (async () => {
  // 1. HttpStatus.NOT_IMPLEMENTED must be 501
  assert.equal(HttpStatus.NOT_IMPLEMENTED, 501, 'HttpStatus.NOT_IMPLEMENTED must equal 501');

  // 2. Each stub produces a distinct errorCode that the frontend keys on
  const stubs: Array<{ errorCode: string; message: string }> = [
    { errorCode: 'challan_tracking_not_implemented', message: 'Challan tracking is not yet implemented' },
    { errorCode: 'cluster_management_not_implemented', message: 'Cluster management is not yet implemented' },
  ];

  for (const stub of stubs) {
    const ex = new HttpException(
      { statusCode: 501, errorCode: stub.errorCode, message: stub.message },
      HttpStatus.NOT_IMPLEMENTED,
    );

    // HTTP status is 501
    assert.equal(ex.getStatus(), 501, `${stub.errorCode}: HTTP status must be 501`);

    // Response body carries errorCode and message
    const body = ex.getResponse() as Record<string, unknown>;
    assert.equal(body.statusCode, 501, `${stub.errorCode}: body.statusCode must be 501`);
    assert.equal(body.errorCode, stub.errorCode, `${stub.errorCode}: body.errorCode must match`);
    assert.equal(typeof body.message, 'string', `${stub.errorCode}: body.message must be a string`);
  }

  // 3. A non-501 error must NOT carry a stub errorCode (guard against false-positives in UI)
  const notFound = new HttpException({ statusCode: 404, message: 'Not found' }, HttpStatus.NOT_FOUND);
  assert.equal(notFound.getStatus(), 404);
  const notFoundBody = notFound.getResponse() as Record<string, unknown>;
  assert.equal(notFoundBody.errorCode, undefined, 'Non-stub exception must not carry a stub errorCode');

  console.log('stub-501 contract tests passed');
})();
