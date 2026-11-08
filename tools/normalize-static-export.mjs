import { readdir, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { constants } from 'node:fs';

// Next's Windows exporter currently leaves OS separators in segment-prefetch filenames.
// The browser protocol uses dots on every platform. Keep originals and add portable aliases.
export async function normalizeStaticExport(root) {
  let copied = 0;
  async function segments(directory, destination, parts) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name),
        names = [...parts, entry.name];
      if (entry.isDirectory()) await segments(path, destination, names);
      else if (entry.isFile() && entry.name.endsWith('.txt')) {
        const alias = join(destination, names.join('.'));
        try {
          await copyFile(path, alias, constants.COPYFILE_EXCL);
          copied++;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if (!(await readFile(path)).equals(await readFile(alias)))
            throw Error(`Conflicting static navigation payload: ${alias}`);
        }
      }
    }
  }
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name);
      if (entry.name.startsWith('__next.')) await segments(path, directory, [entry.name]);
      else await walk(path);
    }
  }
  await walk(root);
  return copied;
}
