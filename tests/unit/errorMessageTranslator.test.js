const { translateErrorMessage } = require('../../src/utils/errorMessageTranslator');

describe('translateErrorMessage', () => {
  it('traduce los mensajes de autorización de historial clínico', () => {
    expect(
      translateErrorMessage('No active access grant found for this patient and professional', 404)
    ).toBe('No existe un permiso de acceso activo para este paciente y profesional.');

    expect(
      translateErrorMessage('The active permissions do not allow delegated read access', 403)
    ).toBe('Los permisos activos no permiten consultar el historial delegado.');
  });

  it('no expone errores técnicos no mapeados', () => {
    expect(translateErrorMessage('Connection refused at internal host', 503)).toBe(
      'Ocurrió un error interno. Intenta nuevamente más tarde.'
    );
  });
});
