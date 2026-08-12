import prettierConfig from '@iobroker/eslint-config/prettier.config.mjs';

export default {
    ...prettierConfig,
    // Im Repository stehen LF, unter Windows checkt git mit CRLF aus. Die
    // Vorgabe "lf" laesst prettier daher jede Zeile jeder Datei anmeckern.
    // "auto" nimmt das Zeilenende, das die Datei mitbringt.
    endOfLine: 'auto',
};
