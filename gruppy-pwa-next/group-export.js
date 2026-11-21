/* Group roster export (local only): Excel XLSX and print-to-PDF A4. */
(function(){
'use strict';
const headers=['№','Фамилия и имя','Вид служения','Назначение'];
const xmlEsc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const htmlEsc=s=>xmlEsc(s);
const utf8=s=>new TextEncoder().encode(s);
const u16=(a,n)=>{a.push(n&255,(n>>>8)&255)};
const u32=(a,n)=>{a.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)};
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0});
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zipFiles(files){
 const out=[],central=[];let offset=0;
 for(const [name,body] of files){
  const n=utf8(name),b=utf8(body),crc=crc32(b),h=[];
  u32(h,0x04034b50);u16(h,20);u16(h,0x800);u16(h,0);u16(h,0);u16(h,0);u32(h,crc);u32(h,b.length);u32(h,b.length);u16(h,n.length);u16(h,0);
  out.push(Uint8Array.from(h),n,b);
  const c=[];u32(c,0x02014b50);u16(c,20);u16(c,20);u16(c,0x800);u16(c,0);u16(c,0);u16(c,0);u32(c,crc);u32(c,b.length);u32(c,b.length);u16(c,n.length);u16(c,0);u16(c,0);u16(c,0);u16(c,0);u32(c,0);u32(c,offset);
  central.push(Uint8Array.from(c),n);offset+=h.length+n.length+b.length;
 }
 const centerSize=central.reduce((sum,a)=>sum+a.length,0),end=[];
 u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,files.length);u16(end,files.length);u32(end,centerSize);u32(end,offset);u16(end,0);
 return new Blob([...out,...central,Uint8Array.from(end)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const col=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s};
function sheetXML(group,rows){
 const all=[[`Группа ${group}`],headers,...rows.map(r=>[r.number,r.name,r.category,r.role])];
 const cols=[7,40,22,35];
 const body=all.map((row,idx)=>`<row r="${idx+1}" ${idx===0?'ht="30" customHeight="1"':''}>`+row.map((v,j)=>{
  const st=idx===0?1:idx===1?2:3;
  return typeof v==='number'?`<c r="${col(j)}${idx+1}" s="${st}"><v>${v}</v></c>`:`<c r="${col(j)}${idx+1}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`
 }).join('')+'</row>').join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${cols.map((n,i)=>`<col min="${i+1}" max="${i+1}" width="${n}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells><printOptions horizontalCentered="1"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/><autoFilter ref="A2:D${Math.max(2,all.length)}"/><pageMargins left="0.39" right="0.39" top="0.39" bottom="0.39" header="0.3" footer="0.3"/></worksheet>`;
}
const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="17"/><color rgb="FF184B85"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF235A99"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7E0EC"/></left><right style="thin"><color rgb="FFD7E0EC"/></right><top style="thin"><color rgb="FFD7E0EC"/></top><bottom style="thin"><color rgb="FFD7E0EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`;
function excel(group,rows){
 const files=[
 ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
 ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Участники" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/worksheets/sheet1.xml',sheetXML(group,rows)],['xl/styles.xml',styles]
 ];
 const blob=zipFiles(files),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Группа_'+String(group).replace(/[\\/:*?"<>|]/g,'_')+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function pdf(group,rows){
 const w=window.open('','_blank');if(!w)return false;
 // Keep the original application URL in the return link; all user data stays in the app.
 const returnUrl=window.location.href;
 const cells=rows.map(r=>`<tr class="${r.role?'role':''}"><td>${r.number}</td><td>${htmlEsc(r.name)}</td><td>${htmlEsc(r.category)}</td><td>${htmlEsc(r.role)}</td></tr>`).join('');
 const doc=`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Группа ${htmlEsc(group)} — список участников</title><style>
 @page{size:A4 landscape;margin:10mm}
 *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Arial",sans-serif;color:#172b3f;margin:0;font-size:7pt}h1{font-size:14pt;text-align:center;margin:0 0 1.5mm}p{font-size:7pt;color:#637588;margin:0 0 3mm;text-align:center}
 table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #bdc8d5;padding:1mm .6mm;vertical-align:middle;line-height:1.13;overflow-wrap:break-word;word-break:normal}th{background:#ebf1f8;color:#223f61;font-weight:700;text-align:center}
 th:nth-child(1){width:7%}th:nth-child(2){width:46%}th:nth-child(3){width:19%}th:nth-child(4){width:28%}
 td{text-align:center}td:nth-child(2){text-align:left}td:nth-child(1){text-align:center}.telephone{white-space:nowrap;font-size:6.7pt;letter-spacing:-.2px;overflow-wrap:normal;word-break:keep-all}
 .role{background:#f4f8fc;font-weight:600}.role+tr:not(.role) td{border-top:2px solid #7b9abf}
 .print-ui{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;margin:0 0 18px;font-size:14px}
 .print-ui button,.print-ui a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border:0;border-radius:10px;padding:12px 17px;font:600 15px -apple-system,BlinkMacSystemFont,"Arial",sans-serif;cursor:pointer;min-height:44px}
 .print-ui button.print{background:#2673cc;color:#fff}.print-ui button.exit{background:#e7edf5;color:#203d5d}.print-ui a{background:#e7edf5;color:#203d5d}
 @media screen{body{max-width:100%;margin:0 auto;padding:14px 8px}.paper{width:100%;max-width:297mm;margin:auto}.print-ui{position:sticky;top:0;z-index:5;background:#fff;padding:8px 2px;border-bottom:1px solid #ccd6e1}}
 @media print{.print-ui{display:none!important}body{padding:0!important}.paper{max-width:none!important}}
 </style></head><body><div class="print-ui"><button type="button" class="print" onclick="window.print()">Печать / Сохранить PDF</button><button type="button" class="exit" id="returnButton">Закрыть и вернуться</button><a id="fallbackReturn" href="${htmlEsc(returnUrl)}" target="_self" style="display:none">Вернуться в программу</a></div><div class="paper"><h1>Группа ${htmlEsc(group)}</h1><p>Список участников · ${rows.length} чел.</p><table><thead><tr>${headers.map(h=>`<th>${htmlEsc(h)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div>
 <script>document.getElementById('returnButton').addEventListener('click',function(){
   // Popups created by script close normally on iPad Safari; fallback always allows navigation.
   window.close();
   setTimeout(function(){window.location.href=document.getElementById('fallbackReturn').href;},180);
 });<\/script></body></html>`;
 w.document.open();w.document.write(doc);w.document.close();w.focus();return true;
}

window.GruppenGroupExport={excel,pdf};
})();
