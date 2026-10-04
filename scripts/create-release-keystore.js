/* scripts/create-release-keystore.js — one-time helper: create the stable release keystore.
   Usage:  node scripts/create-release-keystore.js
   The keystore + passwords stay on YOUR machine only. Never commit them. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdout, stdin, exit, platform, env } from 'node:process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'flosy-release.keystore');

if (existsSync(out)) {
  console.error(`Refusing to overwrite existing ${out}. Delete it first if you really want a new one.`);
  exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q) => (await rl.question(q)).trim();

const pass = await ask('Enter a keystore password (min 6 chars, will not be shown): ');
if (pass.length < 6) { console.error('Password too short.'); exit(1); }
const pass2 = await ask('Repeat the password: ');
rl.close();
if (pass !== pass2) { console.error('Passwords do not match.'); exit(1); }

const keytool = platform === 'win32'
  ? join(process.env.JAVA_HOME || '', 'bin', 'keytool.exe')
  : 'keytool';
if (platform === 'win32' && !existsSync(keytool)) {
  console.error('keytool not found. Install a JDK (or set JAVA_HOME) and retry.');
  exit(1);
}

execFileSync(keytool, [
  '-genkeypair', '-keystore', out,
  '-alias', 'flousy-release', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
  '-storepass', pass, '-keypass', pass,
  '-storetype', 'PKCS12',
  '-dname', 'CN=FLOUSY, OU=Mobile, O=FLOUSY, L=Cairo, ST=EG, C=EG'
], { stdio: 'inherit' });

// verify silently
execFileSync(keytool, ['-list', '-keystore', out, '-storepass', pass, '-alias', 'flousy-release'], { stdio: 'ignore' });

const buf = readFileSync(out);
const sha = createHash('sha256').update(buf).digest('hex');
console.log('\nCreated:', out, `(${statSync(out).size} bytes)`);
console.log('Keystore SHA-256:', sha);
console.log('Alias: flousy-release');
console.log('\nNow base64-encode it and add 4 GitHub secrets (Settings > Secrets and variables > Actions):');
if (platform === 'win32') {
  console.log('  certutil -encode flosy-release.keystore flosy-release.b64   (then copy the content WITHOUT the BEGIN/END lines, or use the one-liner below)');
  console.log('  powershell -NoProfile -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes(\'flosy-release.keystore\')) | Set-Content -NoNewline flosy-release.b64"');
} else {
  console.log('  base64 -w0 flosy-release.keystore > flosy-release.b64');
}
console.log('  KEYSTORE_BASE64   = contents of flosy-release.b64');
console.log('  KEYSTORE_PASSWORD = the password you just chose');
console.log('  KEY_ALIAS         = flousy-release');
console.log('  KEY_PASSWORD      = same password');
console.log('\nIMPORTANT: keep flosy-release.keystore + password backed up privately.');
console.log('Losing them means you can never update the installed app with the same signature.');
