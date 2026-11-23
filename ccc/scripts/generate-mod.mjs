import { WASI, File, Directory, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim';
import { downloadZip } from 'client-zip';
import { ELFFile } from './minielf.js';

const LLD_URL = new URL('./wasm/lld.wasm', import.meta.url);
const MODTOOL_URL = new URL('./wasm/recompmodtool.wasm', import.meta.url);

const files = new Map();
const modules = new Map();
const enc = new TextEncoder();

function getModule(url) {
  if (!modules.has(url.href)) {
    const module = fetch(url).then(async (res) => {
      if (!res.ok) {
        throw new Error(`failed to fetch ${url}: ${res.status}`);
      }
      return WebAssembly.compile(await res.arrayBuffer());
    });
    modules.set(url.href, module);
  }
  return modules.get(url.href);
}

function addFile(path, data) {
  files.set(path, typeof data === 'string' ? enc.encode(data) : data);
}

function getOutput(path) {
  const data = files.get(path);
  if (!data) {
    throw new Error(`${path} was not produced`);
  }
  return data;
}

function putDir(root, path) {
  let dir = root;
  for (const name of path.split('/').filter(Boolean)) {
    let next = dir.contents.get(name);
    if (!next) {
      next = new Directory(new Map());
      dir.contents.set(name, next);
    }
    dir = next;
  }
  return dir;
}

function putFile(root, path, data) {
  const parts = path.split('/');
  const name = parts.pop();
  putDir(root, parts.join('/')).contents.set(name, new File(data));
}

function collect(dir, prefix, out) {
  for (const [name, node] of dir.contents) {
    if (node instanceof Directory) {
      collect(node, prefix + name + '/', out);
    } else {
      out.set(prefix + name, node.data);
    }
  }
}

async function runTool(url, args, dirs = []) {
  const module = await getModule(url);

  const work = new Directory(new Map());
  for (const [p, d] of files) {
    putFile(work, p, d);
  }
  for (const d of dirs) {
    putDir(work, d);
  }

  const stderr = [];
  const fds = [
    /* 0 = /dev/null */ new OpenFile(new File([])),
    /* 1 = stdout */    ConsoleStdout.lineBuffered((l) => console.log(l)),
    /* 2 = stderr */    ConsoleStdout.lineBuffered((l) => {
      stderr.push(l);
      console.error(l);
    }),
    new PreopenDirectory('/', work.contents),
  ];
  const wasi = new WASI(args, [], fds, { debug: false });
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });

  let code;
  try {
    code = wasi.start(instance);
  } catch (e) {
    throw new Error(`${args[0]} crashed: ${e && e.message}`);
  }
  if (code !== 0) {
    throw new Error(`${args[0]} exited with status ${code}\n${stderr.join('\n')}`);
  }

  const out = new Map();
  collect(work, '', out);
  for (const [p, d] of out) {
    files.set(p, d);
  }
}

async function buildModElf(objects) {
  await runTool(LLD_URL, [
    'ld.lld', ...objects, '-nostdlib', '-T', 'base/mod.ld', '-Map', 'build/mod.map',
    '--unresolved-symbols=ignore-all', '--emit-relocs', '-e', '0', '--no-nmagic', '-o', 'mod.elf',
  ], ['build']);

  getOutput('mod.elf');
}

async function binaryToObject(input) {
  const output = input.replace(/\.[^./]*$/, '') + '.o';
  const outputDir = output.split('/').slice(0, -1).join('/');
  await runTool(LLD_URL, ['ld.lld', '-r', '-m', 'elf32btsmip', '--format=binary', input, '-o', output], [outputDir]);
  getOutput(output);
  return output;
}

async function buildMod() {
  await runTool(MODTOOL_URL, ['RecompModTool', 'mod.toml', 'out'], ['out']);

  const entries = ['mod_syms.bin', 'mod_binary.bin', 'mod.json'].map((name) => {
    return { name, input: getOutput(`out/${name}`) };
  });

  return new Uint8Array(await downloadZip(entries).arrayBuffer());
}

const ROOT = new URL('./', import.meta.url);
const MOD_NAME = 'mk64_custom_cups';
const MAX_CUSTOM_CUPS = 20;
const PARENT_MOD_ID = 'mk64_custom_cups_parent';

const fetchBytes = async (path) => {
  const res = await fetch(new URL(path, ROOT));
  if (!res.ok) {
    throw new Error(`failed to fetch ${path}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
};

function createRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function makeMetadataObject(cups) {
  const elf = new ELFFile();
  const rodata = elf.addRodataSection('.rodata.mod_course_data');
  rodata.addSymbol('mod_course_data', (writer) => {
    writer.writeDword(cups.length);
    for (const cup of cups) {
      writer.writeByte(1); // used
      writer.writeZeros(3); // align to 4
      elf.addUnresolvedSymbol(writer, cup.icon);
      for (const course of cup.courses) {
        elf.addUnresolvedSymbol(writer, course);
      }
    }
  });
  return elf.serialize();
}

async function pngToRgba16(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const out = new Uint8Array(bitmap.width * bitmap.height * 2);

  for (let i = 0; i < bitmap.width * bitmap.height; i++) {
    const r = data[4 * i] >> 3;
    const g = data[4 * i + 1] >> 3;
    const b = data[4 * i + 2] >> 3;
    const a = data[4 * i + 3] >= 128 ? 1 : 0;
    const v = (r << 11) | (g << 6) | (b << 1) | a;
    out[2 * i] = v >> 8;
    out[2 * i + 1] = v & 0xff;
  }

  return { data: out, width: bitmap.width, height: bitmap.height };
}

export async function generateMod(cups, { onProgress = () => {} } = {}) {
  if (cups.length > MAX_CUSTOM_CUPS) {
    throw new Error(`At most ${MAX_CUSTOM_CUPS} cups are supported (got ${cups.length}).`);
  }

  const courses = [];
  for (const cup of cups) {
    for (const c of cup.courses) {
      if (!courses.some((x) => x.id === c.id)) {
        courses.push(c);
      }
    }
  }

  onProgress('Loading the build files...');
  addFile('base/mod.ld', await fetchBytes('../base/mod.ld'));
  addFile('base/base.o', await fetchBytes('../base/base.o'));
  addFile('base/syms/mk64.us.syms.toml', await fetchBytes('../base/syms/mk64.us.syms.toml'));
  addFile('base/syms/mk64.us.datasyms.toml', await fetchBytes('../base/syms/mk64.us.datasyms.toml'));

  const objects = ['base/base.o'];

  onProgress('Packaging assets ...');
  for (const [i, course] of courses.entries()) {
    const path = `courses/${course.file}`;
    const bytes = await fetchBytes('../' + path);
    addFile(path, bytes);
    objects.push(await binaryToObject(path));
  }

  for (const [i, cup] of cups.entries()) {
    const png = await fetchBytes(`../cups/${cup.icon}.png`);
    const { data } = await pngToRgba16(png);
    addFile(`cup_${i + 1}.bin`, data);
    objects.push(await binaryToObject(`cup_${i + 1}.bin`));
  }

  onProgress('Creating metadata...');
  const symbolOf = (path) => '_binary_' + path.replace(/[^A-Za-z0-9]/g, '_') + '_start';
  addFile('metadata.o', makeMetadataObject(
    cups.map((cup, i) => ({
      icon: symbolOf(`cup_${i + 1}.bin`),
      courses: cup.courses.map((c) => symbolOf(`courses/${c.file}`)),
    })),
  ));
  objects.push('metadata.o');

  const modHash = createRandomString(10);
  const modId = `${MOD_NAME}_${modHash}`;

  onProgress('Linking the mod ...');
  await buildModElf(objects);

  onProgress('Packaging the mod...');
  addFile('mod.toml', `[manifest]
id = "${modId}" 
version = "1.0.0"
display_name = "Custom Cups ${modHash}"
description = "Custom cups created with the MK64 Recompiled cup editor."
short_description = "Custom cups"
authors = ["Cup Editor"]
minimum_recomp_version = "0.0.1"
game_id = "mk64"
dependencies = ["${PARENT_MOD_ID}"]

[inputs]
elf_path = "mod.elf"
mod_filename = "${modId}"
func_reference_syms_file = "base/syms/mk64.us.syms.toml"
data_reference_syms_files = ["base/syms/mk64.us.datasyms.toml"]
`);
  const nrm = await buildMod();
  return { nrm, filename: `${modId}.nrm` };
}
