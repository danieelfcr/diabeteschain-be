const crypto = require('crypto');
const IdentityRepository = require('../../src/repositories/identity.repository');
const { serializeCanonicalPayload } = require('../../src/utils/signatureCanonicalization');

describe('IdentityRepository.verifySignature', () => {
  const repository = new IdentityRepository();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  function signPayload(payload) {
    const signer = crypto.createSign('SHA256');
    signer.update(serializeCanonicalPayload(payload), 'utf8');
    signer.end();

    return signer.sign(privateKey, 'base64');
  }

  it('validates signatures using the canonical payload representation', () => {
    const signedPayload = {
      action: 'GRANT_ACCESS',
      patientPseudoId: 'patient-001',
      granteeId: 'doctor-001',
      allowedActions: ['read', 'write'],
      allowedScopes: ['labs', 'summary'],
      validFrom: '2026-04-16T00:00:00.000Z',
      validTo: '2026-04-17T00:00:00.000Z',
    };

    const signature = signPayload(signedPayload);
    const reorderedPayload = {
      validTo: '2026-04-17T00:00:00.000Z',
      allowedScopes: ['labs', 'summary'],
      allowedActions: ['read', 'write'],
      granteeId: 'doctor-001',
      patientPseudoId: 'patient-001',
      action: 'GRANT_ACCESS',
      validFrom: '2026-04-16T00:00:00.000Z',
    };

    expect(
      repository.verifySignature({
        publicKey,
        payload: reorderedPayload,
        signature,
      })
    ).toBe(true);
  });

  it('fails verification when a signed field changes', () => {
    const signedPayload = {
      action: 'REVOKE_ACCESS',
      patientPseudoId: 'patient-001',
      granteeId: 'doctor-001',
    };

    const signature = signPayload(signedPayload);
    const tamperedPayload = {
      ...signedPayload,
      granteeId: 'doctor-002',
    };

    expect(
      repository.verifySignature({
        publicKey,
        payload: tamperedPayload,
        signature,
      })
    ).toBe(false);
  });
});
