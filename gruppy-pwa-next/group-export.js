/* Group roster export (local only): Excel XLSX and direct vector PDF A4. */
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
 const blob=buildGroupPdfBlob(group,rows);
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='Группа_'+String(group).replace(/[\\/:*?"<>|]/g,'_')+'.pdf';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);return true;
}
// Export an actual one-page PDF. No browser print dialog, header/footer, or page orientation defaults.
// Create a true vector PDF: text is encoded as a searchable/selectable Type3 PDF
// font with ToUnicode maps. No canvas, JPEG, PNG or printed web page is used.
function buildAllGroupsPdfBlob(columns){
 const data=window.GruppenPDFGlyphs;
 if(!data||!data.r||!data.b)throw new Error('Не загрузились векторные символы PDF');
 const chars=Object.keys(data.r).filter(c=>data.b[c]);
 if(chars.length>254)throw new Error('Слишком много символов для PDF');
 const encMap=new Map(chars.map((c,i)=>[c,i+1]));
 const fallback=encMap.get('?')||1;
 const ptPerMm=72/25.4, PW=297*ptPerMm,PH=210*ptPerMm;
 const colorHex=h=>{let a=h.replace('#','');if(a.length===3)a=Array.from(a).map(c=>c+c).join('');return [0,2,4].map(i=>(parseInt(a.slice(i,i+2),16)/255).toFixed(4)).join(' ')};
 const fmt=v=>(Math.round(v*1000)/1000).toString();
 let currentSize=12,currentBold=false;
 const setFont=(pt,bold=false)=>{currentSize=pt;currentBold=bold};
 const glyph=c=>(data[currentBold?'b':'r'][c]||data[currentBold?'b':'r']['?']);
 const measure=(v)=>Array.from(String(v??'')).reduce((n,c)=>n+(glyph(c)?.[0]||500)*currentSize/1000,0)/ptPerMm;
 const chunks=[];
 const add=s=>chunks.push(s);
 const rect=(x,y,w,h,c)=>add(`${colorHex(c)} rg ${fmt(x*ptPerMm)} ${fmt((210-y-h)*ptPerMm)} ${fmt(w*ptPerMm)} ${fmt(h*ptPerMm)} re f\n`);
 const line=(x,y,X,Y,c='#969696',thick=.18)=>add(`${colorHex(c)} RG ${fmt(thick*ptPerMm)} w ${fmt(x*ptPerMm)} ${fmt((210-y)*ptPerMm)} m ${fmt(X*ptPerMm)} ${fmt((210-Y)*ptPerMm)} l S\n`);
 const text=(v,x,y,align='left',c='#151515',baseline='alphabetic')=>{
  v=String(v??'');const w=measure(v);
  const dx=align==='center'?w/2:align==='right'?w:0;
  const yPt=(210-y)*ptPerMm-(baseline==='middle'?currentSize*.34:0);
  const hex=Array.from(v).map(ch=>(encMap.get(ch)||fallback).toString(16).padStart(2,'0')).join('');
  add(`${colorHex(c)} rg BT /${currentBold?'FB':'FR'} ${fmt(currentSize)} Tf ${fmt((x-dx)*ptPerMm)} ${fmt(yPt)} Td <${hex}> Tj ET\n`);
 };
 const x0=15,x1=282,colW=(x1-x0)/4, groups=['А1','А2','Б1','Б2'];
 const headerY=32, majorH=8,minorH=8, peopleTop=headerY+majorH+minorH,maxBottom=210-15-9;
 const maxNameW=colW-4.5;
 const splitName=name=>{const out=[];let cur='';for(const word of String(name||'').trim().split(/\s+/)){
  const merged=cur?cur+' '+word:word;if(measure(merged)<=maxNameW){cur=merged;continue}
  if(cur)out.push(cur);cur=word;
  while(measure(cur)>maxNameW&&cur.length>1){let k=cur.length-1;while(k>1&&measure(cur.slice(0,k))>maxNameW)k--;out.push(cur.slice(0,k));cur=cur.slice(k)}
 }if(cur)out.push(cur);return out.length?out:['']};
 let chosenSize=9, chosenLines=[];
 for(let size=18;size>=9;size-=.25){setFont(size);const ls=columns.map(group=>group.map(p=>{setFont(size,p.role==='leader');return splitName(p.name)}));
  const step=size/ptPerMm*1.18;const needed=Math.max(0,...ls.map(group=>group.reduce((s,l)=>s+l.length*step+.5,0)));
  if(peopleTop+needed+1<=maxBottom){chosenSize=size;chosenLines=ls;break}
 }
 if(!chosenLines.length){chosenLines=columns.map(group=>group.map(p=>{setFont(chosenSize,p.role==='leader');return splitName(p.name)}))}
 const step=chosenSize/ptPerMm*1.18;
 const tall=Math.max(0,...chosenLines.map(group=>group.reduce((s,l)=>s+l.length*step+.5,0)));
 const tableBottom=Math.min(210-15-8,Math.max(peopleTop+2,peopleTop+tall+1.5));
 setFont(18,true);text('Группы уборки и',148.5,20,'center');text('проповеднического служения',148.5,27,'center');
 rect(x0,headerY,x1-x0,majorH,'#e6eafa');rect(x0,headerY+majorH,x1-x0,minorH,'#e5e5e5');
 line(x0,headerY,x1,headerY);line(x0,headerY+majorH,x1,headerY+majorH);line(x0,peopleTop,x1,peopleTop);
 setFont(14);text('Группа уборки: А',x0+colW,headerY+majorH/2,'center','#151515','middle');text('Группа уборки: Б',x0+3*colW,headerY+majorH/2,'center','#151515','middle');
 setFont(14,true);groups.forEach((g,i)=>text('ГПС - '+g,x0+(i+.5)*colW,headerY+majorH+minorH/2,'center','#151515','middle'));
 for(let i=0;i<=4;i++){const x=x0+i*colW;if(i===2){line(x-.35,headerY,x-.35,tableBottom,'#333',.33);line(x+.35,headerY,x+.35,tableBottom,'#333',.33)}else if(i===1||i===3)line(x,headerY+majorH,x,tableBottom,'#888',.18);else line(x,headerY,x,tableBottom,'#888',.18)}
 line(x0,tableBottom,x1,tableBottom,'#888',.18);
 for(let g=0;g<4;g++){
  let y=peopleTop+.25;const people=columns[g]||[];
  people.forEach((person,i)=>{const rows=chosenLines[g][i];setFont(chosenSize,person.role==='leader');
   rows.forEach(part=>{y+=step;text(part,x0+g*colW+1,y-.75)});y+=.5;
   if(person.role==='leader'||person.role==='assistant')line(x0+g*colW+.5,y,x0+(g+1)*colW-.5,y,'#777',.2);
  });
 }
 const fy=tableBottom+2;line(x0,fy,x1,fy,'#666',.22);line(x0,fy+5.8,x1,fy+5.8,'#666',.22);line(x0,fy,x0,fy+5.8,'#666',.22);line(x1,fy,x1,fy+5.8,'#666',.22);
 setFont(10);text('Versammlung «Norderstedt russisch» (33779)',x0+.7,fy+4);
 const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});text(date,x1-.7,fy+4,'right');
 return writeVectorPdf([chunks.join('')],data,chars,PW,PH,fmt);
}
function writeVectorPdf(streams,data,chars,PW,PH,fmt){
 const objects=[];const put=(s)=>{objects.push(s);return objects.length};
 const pdfEsc=s=>String(s).replace(/[\\()]/g,'\\$&');
 const unicodeHex=c=>{const arr=[];for(let i=0;i<c.length;i++)arr.push(c.charCodeAt(i).toString(16).padStart(4,'0'));return arr.join('')};
 const cmapBody=[];for(let i=0;i<chars.length;i+=90){const part=chars.slice(i,i+90);cmapBody.push(`${part.length} beginbfchar\n${part.map((c,j)=>`<${(i+j+1).toString(16).padStart(2,'0')}> <${unicodeHex(c)}> `).join('\n')}\nendbfchar`)}
 const cmap=`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /GruppenUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<01> <FF>\nendcodespacerange\n${cmapBody.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend end`;
 const objStream=s=>`<< /Length ${new TextEncoder().encode(s).length} >>\nstream\n${s}\nendstream`;
 const catalog=put(''),pages=put('');
 const pageRefs=streams.map(stream=>({page:put(''),content:put(objStream(stream))}));
 const fontObjs={};
 for(const [tag,key] of [['FR','r'],['FB','b']]){
  const charproc=[];
  for(let i=0;i<chars.length;i++){const [width,path]=data[key][chars[i]];const form=`${fmt(width)} 0 -1000 -700 3000 2300 d1\n${path} f\n`;
   charproc.push(put(objStream(form)))}
  const uni=put(objStream(cmap));
  const proc=chars.map((_,i)=>`/g${i+1} ${charproc[i]} 0 R`).join(' ');
  const names=chars.map((_,i)=>`/g${i+1}`).join(' ');
  const widths=chars.map(ch=>fmt(data[key][ch][0])).join(' ');
  fontObjs[tag]=put(`<< /Type /Font /Subtype /Type3 /Name /${tag} /FontBBox [-1000 -700 3000 2300] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ${proc} >> /Encoding << /Type /Encoding /Differences [1 ${names}] >> /FirstChar 1 /LastChar ${chars.length} /Widths [${widths}] /Resources << >> /ToUnicode ${uni} 0 R >>`);
 }
 objects[catalog-1]=`<< /Type /Catalog /Pages ${pages} 0 R >>`;
 objects[pages-1]=`<< /Type /Pages /Kids [${pageRefs.map(p=>p.page+" 0 R").join(" ")}] /Count ${pageRefs.length} >>`;
 for(const {page,content} of pageRefs)objects[page-1]=`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${fmt(PW)} ${fmt(PH)}] /Resources << /Font << /FR ${fontObjs.FR} 0 R /FB ${fontObjs.FB} 0 R >> >> /Contents ${content} 0 R >>`;
 const encoder=new TextEncoder(),dataChunks=[],offsets=[0];let byteCount=0;
 const push=s=>{const bytes=encoder.encode(s);dataChunks.push(bytes);byteCount+=bytes.length};
 push('%PDF-1.5\n');objects.forEach((s,i)=>{offsets[i+1]=byteCount;push(`${i+1} 0 obj\n${s}\nendobj\n`)});
 const xref=byteCount;push(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`);
 for(let i=1;i<=objects.length;i++)push(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
 push(`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`);
 return new Blob(dataChunks,{type:'application/pdf'});
}
function buildGroupPdfBlob(group,rows){
 const data=window.GruppenPDFGlyphs;
 if(!data||!data.r||!data.b)throw new Error('Не загрузились векторные символы PDF');
 const chars=Object.keys(data.r).filter(c=>data.b[c]);
 if(chars.length>254)throw new Error('Слишком много символов для PDF');
 const encMap=new Map(chars.map((c,i)=>[c,i+1]));
 const fallback=encMap.get('?')||1;
 const ptPerMm=72/25.4, PW=297*ptPerMm,PH=210*ptPerMm;
 const colorHex=h=>{let a=h.replace('#','');if(a.length===3)a=Array.from(a).map(c=>c+c).join('');return [0,2,4].map(i=>(parseInt(a.slice(i,i+2),16)/255).toFixed(4)).join(' ')};
 const fmt=v=>(Math.round(v*1000)/1000).toString();
 let currentSize=12,currentBold=false;
 const setFont=(pt,bold=false)=>{currentSize=pt;currentBold=bold};
 const glyph=c=>(data[currentBold?'b':'r'][c]||data[currentBold?'b':'r']['?']);
 const measure=(v)=>Array.from(String(v??'')).reduce((n,c)=>n+(glyph(c)?.[0]||500)*currentSize/1000,0)/ptPerMm;
 const chunks=[];
 const add=s=>chunks.push(s);
 const rect=(x,y,w,h,c)=>add(`${colorHex(c)} rg ${fmt(x*ptPerMm)} ${fmt((210-y-h)*ptPerMm)} ${fmt(w*ptPerMm)} ${fmt(h*ptPerMm)} re f\n`);
 const line=(x,y,X,Y,c='#969696',thick=.18)=>add(`${colorHex(c)} RG ${fmt(thick*ptPerMm)} w ${fmt(x*ptPerMm)} ${fmt((210-y)*ptPerMm)} m ${fmt(X*ptPerMm)} ${fmt((210-Y)*ptPerMm)} l S\n`);
 const text=(v,x,y,align='left',c='#151515',baseline='alphabetic')=>{
  v=String(v??'');const w=measure(v);
  const dx=align==='center'?w/2:align==='right'?w:0;
  const yPt=(210-y)*ptPerMm-(baseline==='middle'?currentSize*.34:0);
  const hex=Array.from(v).map(ch=>(encMap.get(ch)||fallback).toString(16).padStart(2,'0')).join('');
  add(`${colorHex(c)} rg BT /${currentBold?'FB':'FR'} ${fmt(currentSize)} Tf ${fmt((x-dx)*ptPerMm)} ${fmt(yPt)} Td <${hex}> Tj ET\n`);
 };
 const streams=[],x0=10,x1=287,top=26,bottom=200;
 const widths=[19.39,127.42,52.63,77.56], xs=[x0];
 widths.forEach(w=>xs.push(xs[xs.length-1]+w));
 const rowFont=7,step=3.5,pad=1.1;
 function wrap(value,maxWidth){
  const out=[];let line='';
  for(const ch of Array.from(String(value??'').normalize('NFC'))){
   if(ch==='\n'){out.push(line);line='';continue;}
   if(line&&measure(line+ch)>maxWidth){out.push(line);line=ch;}else line+=ch;
  }out.push(line);return out;
 }
 let y=top,previousRole=false;
 function begin(){
  chunks.length=0;setFont(14,true);text('Группа '+group,148.5,15,'center','#172b3f');
  setFont(7);text('Список участников · '+rows.length+' чел.',148.5,20,'center','#637588');
  y=top;rect(x0,y,x1-x0,6,'#ebf1f8');setFont(7,true);
  headers.forEach((h,i)=>text(h,(xs[i]+xs[i+1])/2,y+3,'center','#223f61','middle'));
  for(const x of xs)line(x,y,x,y+6,'#bdc8d5');line(x0,y,x1,y,'#bdc8d5');line(x0,y+6,x1,y+6,'#bdc8d5');y+=6;previousRole=false;
 }
 function finish(){streams.push(chunks.join(''));}
 begin();
 for(const r of rows){
  const bold=!!r.role;setFont(rowFont,bold);
  const cells=[r.number,r.name,r.category,r.role].map((v,i)=>wrap(v,widths[i]-2*pad));
  const maxLines=Math.max(...cells.map(v=>v.length));let offset=0;
  while(offset<maxLines){
   if(y+step+2*pad>bottom){finish();begin();}
   const count=Math.min(maxLines-offset,Math.floor((bottom-y-2*pad)/step));
   const h=count*step+2*pad;setFont(rowFont,bold);
   if(bold)rect(x0,y,x1-x0,h,'#f4f8fc');
   if(previousRole&&!bold)line(x0,y,x1,y,'#7b9abf',.5);
   cells.forEach((lines,i)=>lines.slice(offset,offset+count).forEach((v,j)=>text(v,i===1?xs[i]+pad:(xs[i]+xs[i+1])/2,y+pad+(j+.5)*step,i===1?'left':'center','#172b3f','middle')));
   for(const x of xs)line(x,y,x,y+h,'#bdc8d5');line(x0,y+h,x1,y+h,'#bdc8d5');
   y+=h;offset+=count;previousRole=bold;
  }
 }
 finish();return writeVectorPdf(streams,data,chars,PW,PH,fmt);
}
async function allGroupsPdf(columns){
 const blob=buildAllGroupsPdfBlob(columns);
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Группы уборки и проповеднического служения.pdf';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);return true;
}

window.GruppenGroupExport={excel,pdf,allGroupsPdf,buildAllGroupsPdfBlob,buildGroupPdfBlob};
})();
