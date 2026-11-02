// Dependency-free ZIP packaging. Only runtime files enter the archive.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(data) { let crc = -1; for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ -1) >>> 0; }
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]); }
const local = [], central = []; let offset = 0;
for (const file of walk(source).sort()) {
  const name = Buffer.from(path.relative(source, file).replaceAll('\\', '/'));
  const data = fs.readFileSync(file), packed = zlib.deflateRawSync(data), crc = crc32(data);
  const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(8, 8); head.writeUInt16LE(0x5821, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
  local.push(head, name, packed);
  const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); head.copy(entry, 6, 4, 30); entry.writeUInt32LE(offset, 42); central.push(entry, name);
  offset += head.length + name.length + packed.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const archive = Buffer.concat([...local, directory, end]);
for (const ext of ['zip', 'xpi']) {
  const name = `52poke-mark-${manifest.version}-unsigned.${ext}`; fs.writeFileSync(path.join(root, 'dist', name), archive); console.log(`${name} (${archive.length} bytes; unsigned)`);
}
