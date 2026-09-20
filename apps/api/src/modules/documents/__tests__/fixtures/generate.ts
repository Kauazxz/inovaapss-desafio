/**
 * Gera as fixtures binárias dos testes de extração (não é um teste; roda uma vez):
 *   pnpm --filter @inovaapss/api exec tsx src/modules/documents/__tests__/fixtures/generate.ts
 *
 * - manual-kpi.docx: DOCX mínimo (zip "stored", sem compressão) com dois parágrafos.
 * - atendimento.xlsx: planilha com duas abas, gerada pela própria biblioteca xlsx.
 * - politica-sla.pdf: PDF de uma página com texto em Helvetica, escrito à mão.
 * Os arquivos de texto (csv, json, md) ficam versionados direto, sem gerador.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

import * as XLSX from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- ZIP mínimo (entradas "stored") ----------

interface ZipEntry {
  name: string;
  data: Buffer;
}

function u16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

function buildZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      name,
      entry.data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function buildDocx(paragraphs: readonly string[]): Buffer {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`)
    .join('');
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body></w:document>`;
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
  ]);
}

// ---------- PDF mínimo de uma página ----------

function buildPdf(lines: readonly string[]): Buffer {
  const content = ['BT', '/F1 14 Tf', '72 720 Td', '16 TL']
    .concat(lines.map((line) => `(${line.replace(/[()\\]/g, '\\$&')}) Tj T*`))
    .concat(['ET'])
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ---------- XLSX via a própria biblioteca ----------

function buildXlsx(): Buffer {
  const workbook = XLSX.utils.book_new();
  const atendimento = XLSX.utils.aoa_to_sheet([
    ['cliente_id', 'mes_ref', 'chamados_abertos', 'pct_sla_cumprido'],
    ['C001', '2026-07', 12, 91.5],
    ['C001', '2026-08', 15, 88.0],
    ['C002', '2026-08', 3, 100],
  ]);
  const metas = XLSX.utils.aoa_to_sheet([
    ['indicador', 'meta', 'unidade'],
    ['Tempo medio de resolucao', 8, 'h'],
    ['Cumprimento de SLA', 95, '%'],
  ]);
  XLSX.utils.book_append_sheet(workbook, atendimento, 'atendimento');
  XLSX.utils.book_append_sheet(workbook, metas, 'metas');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

writeFileSync(
  path.join(here, 'manual-kpi.docx'),
  buildDocx([
    'Manual de KPI da GlobalSys.',
    'O tempo medio de resolucao de chamados criticos nao pode passar de 8 horas.',
  ]),
);
writeFileSync(path.join(here, 'atendimento.xlsx'), buildXlsx());
writeFileSync(
  path.join(here, 'politica-sla.pdf'),
  buildPdf([
    'Politica de SLA',
    'Chamados criticos: resolucao em ate 8 horas.',
    'Meta de cumprimento: 95%.',
  ]),
);

console.log('Fixtures geradas em', here);
