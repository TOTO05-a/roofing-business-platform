/**
 * Imprime el código de 6 dígitos actual del 2FA de la demo (administrador y superadministrador).
 * Ejecuta: pnpm demo:codigo   (ver CREDENCIALES.md). No usa red ni base de datos.
 */
import { DEMO_2FA_EMAILS, demoTotpCode } from './demo-2fa.js';

const { code, secondsLeft } = demoTotpCode();
console.log(`\nCódigo de verificación de la demo: ${code}   (vale ${secondsLeft} s más)`);
console.log(`Sirve para: ${DEMO_2FA_EMAILS.join(' y ')}`);
console.log('Si caduca antes de escribirlo, ejecuta `pnpm demo:codigo` otra vez.\n');
