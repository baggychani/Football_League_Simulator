import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceFile } from './file-system';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const fonts = [
  {
    name: 'Space Grotesk Latin variable',
    source:
      'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2',
    destination: resolve(
      projectRoot,
      'public',
      'fonts',
      'SpaceGroteskVariable.woff2',
    ),
  },
] as const;

const licenses = [
  {
    name: 'Space Grotesk OFL license',
    source:
      'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt',
    destination: resolve(
      projectRoot,
      'public',
      'fonts',
      'OFL-SpaceGrotesk.txt',
    ),
  },
] as const;

async function syncFont(font: (typeof fonts)[number]) {
  const response = await fetch(font.source, {
    headers: {
      'User-Agent': 'FootballSimulator/1.0 (local asset preparation)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${font.name}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 4));
  if (signature !== 'wOF2') {
    throw new Error(`${font.name}: invalid WOFF2 signature ${signature}`);
  }

  await mkdir(dirname(font.destination), { recursive: true });
  const temporary = `${font.destination}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes);
    await replaceFile(temporary, font.destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }

  console.log(`${font.name}: ${bytes.byteLength.toLocaleString()} bytes`);
}

for (const font of fonts) {
  await syncFont(font);
}

for (const license of licenses) {
  const response = await fetch(license.source, {
    headers: {
      'User-Agent': 'FootballSimulator/1.0 (local asset preparation)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${license.name}: HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes('SIL OPEN FONT LICENSE')) {
    throw new Error(`${license.name}: unexpected license document`);
  }
  await mkdir(dirname(license.destination), { recursive: true });
  const temporary = `${license.destination}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, text);
    await replaceFile(temporary, license.destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  console.log(`${license.name}: ${text.length.toLocaleString()} characters`);
}
