const {
  canonicalizeForSignature,
  serializeCanonicalPayload,
} = require('../../src/utils/signatureCanonicalization');

describe('signatureCanonicalization', () => {
  it('produces the same canonical string for equivalent objects with different key order', () => {
    const leftPayload = {
      z: 3,
      nested: {
        b: 2,
        a: 1,
      },
      arr: [
        { y: 2, x: 1 },
        'alpha',
      ],
    };

    const rightPayload = {
      arr: [
        { x: 1, y: 2 },
        'alpha',
      ],
      nested: {
        a: 1,
        b: 2,
      },
      z: 3,
    };

    expect(serializeCanonicalPayload(leftPayload)).toBe(serializeCanonicalPayload(rightPayload));
  });

  it('preserves array order and omits undefined object properties', () => {
    const canonicalPayload = canonicalizeForSignature({
      unorderedSetLikeArray: ['labs', 'summary'],
      nested: {
        omitMe: undefined,
        keepMe: true,
      },
    });

    expect(canonicalPayload).toEqual({
      nested: {
        keepMe: true,
      },
      unorderedSetLikeArray: ['labs', 'summary'],
    });
  });

  it('rejects undefined entries inside arrays', () => {
    expect(() =>
      serializeCanonicalPayload({
        items: ['valid', undefined],
      })
    ).toThrow('Signed payload arrays cannot contain undefined values');
  });
});
