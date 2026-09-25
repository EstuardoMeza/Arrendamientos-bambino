let STATE = JSON.parse(document.getElementById('state').textContent);
if(!STATE.fechaConsulta){ STATE.fechaConsulta = new Date().toISOString().slice(0,10); }
let nextId = Math.max(0, ...STATE.inmuebles.map(i=>i.id||0)) + 1;
let artifactApi = null;
if(typeof claude !== 'undefined' && claude && claude.use){
  claude.use('artifact').then(a=>{ artifactApi = a; }).catch(()=>{});
  claude.use('downloads').then(d=>{ window._dl = d; }).catch(()=>{});
}

function fmtQ(n){ return 'Q' + Number(n||0).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtD(d){ if(!d) return ''; const [y,m,dd]=d.split('-'); return dd+'/'+m+'/'+y; }
function addMonths(dateStr, n){ const d=new Date(dateStr+'T00:00:00'); const day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n); const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); d.setDate(Math.min(day,last)); return d; }
function diffDays(a,b){ return Math.round((a-b)/86400000); }

function computeRow(inm, consulta){
  const c = new Date(consulta+'T00:00:00');
  const dia = Math.min(31, Math.max(1, parseInt(inm.diaPago)||1));
  const lastDayThis = new Date(c.getFullYear(), c.getMonth()+1, 0).getDate();
  let proximo = new Date(c.getFullYear(), c.getMonth(), Math.min(dia,lastDayThis));
  if(proximo < c) proximo = addMonths(consulta, 1), proximo.setDate(Math.min(dia, new Date(proximo.getFullYear(),proximo.getMonth()+1,0).getDate()));
  const diasPago = diffDays(proximo, c);
  let diasVenc = null, estado = '';
  if(inm.vencimiento){
    const v = new Date(inm.vencimiento+'T00:00:00');
    diasVenc = diffDays(v, c);
    estado = diasVenc < 0 ? 'VENCIDO' : (diasVenc <= STATE.alertaVenc ? 'POR VENCER' : 'VIGENTE');
  }
  let obs = '';
  if(inm.vencimiento){
    const v = new Date(inm.vencimiento+'T00:00:00');
    if(estado==='VENCIDO') obs = 'Contrato vencido: confirmar renovación';
    else if(proximo > v) obs = 'El contrato vence antes de este pago: confirmar renovación';
  }
  return {proximo, diasPago, diasVenc, estado, obs};
}

function badge(estado){
  if(estado==='VIGENTE') return '<span class="badge b-ok">VIGENTE</span>';
  if(estado==='POR VENCER') return '<span class="badge b-warn">POR VENCER</span>';
  if(estado==='VENCIDO') return '<span class="badge b-bad">VENCIDO</span>';
  return '';
}

function render(){
  document.getElementById('pFecha').value = STATE.fechaConsulta;
  document.getElementById('pAlertaPago').value = STATE.alertaPago;
  document.getElementById('pAlertaVenc').value = STATE.alertaVenc;

  const rows = STATE.inmuebles.map(inm => ({inm, calc: computeRow(inm, STATE.fechaConsulta)}));
  rows.sort((a,b)=> a.calc.proximo - b.calc.proximo);

  const alertaPago = Number(STATE.alertaPago);
  let rentaTotal=0, pagosAlerta=0, montoAlerta=0, porVencer=0, vencidos=0;
  rows.forEach(({inm,calc})=>{
    rentaTotal += Number(inm.renta)||0;
    if(calc.diasPago>=0 && calc.diasPago<=alertaPago){ pagosAlerta++; montoAlerta += Number(inm.renta)||0; }
    if(calc.estado==='POR VENCER') porVencer++;
    if(calc.estado==='VENCIDO') vencidos++;
  });
  const stats = [
    ['Inmuebles arrendados', rows.length],
    ['Renta mensual total', fmtQ(rentaTotal)],
    ['Pagos dentro de la alerta', pagosAlerta],
    ['Monto de esos pagos', fmtQ(montoAlerta)],
    ['Contratos por vencer', porVencer],
    ['Contratos vencidos', vencidos],
  ];
  document.getElementById('stats').innerHTML = stats.map(([l,n])=>
    `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  const tbody = document.getElementById('tbody');
  tbody.innerHTML = rows.map(({inm,calc})=>{
    const dentro = inm.vencimiento && calc.proximo > new Date(inm.vencimiento+'T00:00:00');
    return `<tr data-id="${inm.id}">
      <td><input data-f="propietario" value="${esc(inm.propietario)}" style="font-weight:bold;margin-bottom:2px">
          <input data-f="ref" value="${esc(inm.ref)}"></td>
      <td><input data-f="renta" type="number" value="${inm.renta}" style="width:80px"></td>
      <td><input data-f="diaPago" type="number" min="1" max="31" value="${inm.diaPago}" style="width:50px"> del mes</td>
      <td><input data-f="vencimiento" type="date" value="${inm.vencimiento||''}"></td>
      <td>${fmtD(calc.proximo.toISOString().slice(0,10))}</td>
      <td>${calc.diasPago}</td>
      <td>${badge(calc.estado)}${calc.obs?`<div class="note" style="color:var(--redT)">${esc(calc.obs)}</div>`:''}</td>
      <td><button class="danger small" onclick="delRow(${inm.id})">Eliminar</button></td>
    </tr>`;
  }).join('');
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function collectFromTable(){
  const byId = {};
  STATE.inmuebles.forEach(i=>byId[i.id]=i);
  document.querySelectorAll('#tbody tr').forEach(tr=>{
    const id = Number(tr.dataset.id);
    const inm = byId[id]; if(!inm) return;
    tr.querySelectorAll('[data-f]').forEach(inp=>{
      const f = inp.dataset.f;
      inm[f] = (f==='renta'||f==='diaPago') ? Number(inp.value)||0 : inp.value;
    });
  });
}

function delRow(id){
  if(!confirm('¿Eliminar este inmueble?')) return;
  STATE.inmuebles = STATE.inmuebles.filter(i=>i.id!==id);
  render();
  persist('Inmueble eliminado.');
}

document.getElementById('btnAdd').onclick = ()=>{
  STATE.inmuebles.push({id:nextId++, propietario:'', ref:'Nuevo inmueble', direccion:'', finca:'', departamento:'', municipio:'', matricula:'', tipo:'', renta:0, diaPago:1, vencimiento:''});
  render();
};

document.getElementById('btnSave').onclick = ()=>{
  collectFromTable();
  render();
  persist('Cambios guardados.');
};

document.getElementById('btnParamSave').onclick = ()=>{
  STATE.fechaConsulta = document.getElementById('pFecha').value || new Date().toISOString().slice(0,10);
  STATE.alertaPago = Number(document.getElementById('pAlertaPago').value)||0;
  STATE.alertaVenc = Number(document.getElementById('pAlertaVenc').value)||0;
  render();
  persist('Parámetros guardados.');
};

document.getElementById('btnUpload').onclick = ()=> document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      const parsed = rows.map(parseRow).filter(Boolean);
      if(parsed.length===0){ showMsg('uploadMsg','No se encontraron filas reconocibles en el archivo.', false); return; }
      if(!confirm(`Se encontraron ${parsed.length} inmueble(s). Esto reemplazará la lista actual. ¿Continuar?`)) return;
      STATE.inmuebles = parsed;
      nextId = parsed.length + 1;
      render();
      persist(`Datos actualizados desde "${file.name}" (${parsed.length} inmuebles).`);
      showMsg('uploadMsg', `Se cargaron ${parsed.length} inmueble(s) desde ${file.name}.`, true);
    }catch(err){
      showMsg('uploadMsg', 'No se pudo leer el archivo: '+err.message, false);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
};

function findKey(row, needles){
  const keys = Object.keys(row);
  for(const k of keys){
    const nk = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    for(const n of needles) if(nk.includes(n)) return k;
  }
  return null;
}
function parseDateVal(v){
  if(!v) return '';
  if(v instanceof Date) return v.toISOString().slice(0,10);
  if(typeof v==='number'){ const d=new Date(Math.round((v-25569)*86400*1000)); return d.toISOString().slice(0,10); }
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return s.slice(0,10);
  return '';
}
function parseRow(row, idx){
  const kProp = findKey(row,['propietario']);
  const kDir = findKey(row,['direccion']);
  if(!kProp && !kDir) return null;
  const kFinca = findKey(row,['finca']);
  const kDep = findKey(row,['departamento']);
  const kMun = findKey(row,['municipio']);
  const kMat = findKey(row,['matricula']);
  const kRenta = findKey(row,['arrendamiento','renta','monto']);
  const kPago = findKey(row,['fecha pago','pago']);
  const kVenc = findKey(row,['vencimiento']);
  const propietario = kProp ? String(row[kProp]).trim() : '';
  const direccion = kDir ? String(row[kDir]).trim() : '';
  if(!propietario && !direccion) return null;
  const pagoTxt = kPago ? String(row[kPago]).trim() : '';
  const diaMatch = pagoTxt.match(/(\d{1,2})/);
  const dia = diaMatch ? parseInt(diaMatch[1]) : 1;
  let ref = direccion.match(/apto\.?\s*[\w-]+/i);
  ref = ref ? ref[0] : ('Inmueble ' + (idx!=null?idx+1:''));
  return {
    id: (idx!=null?idx:0)+1,
    propietario, ref: ref.charAt(0).toUpperCase()+ref.slice(1),
    direccion,
    finca: kFinca ? String(row[kFinca]).trim() : '',
    departamento: kDep ? String(row[kDep]).trim() : '',
    municipio: kMun ? String(row[kMun]).trim() : '',
    matricula: kMat ? String(row[kMat]).trim() : '',
    tipo: 'Apartamento',
    renta: kRenta ? Number(row[kRenta])||0 : 0,
    diaPago: dia,
    vencimiento: kVenc ? parseDateVal(row[kVenc]) : ''
  };
}

document.getElementById('btnDownload').onclick = async ()=>{
  const data = STATE.inmuebles.map(inm=>{
    const c = computeRow(inm, STATE.fechaConsulta);
    return {
      'PROPIETARIO': inm.propietario, 'INMUEBLE': inm.ref, 'DIRECCION': inm.direccion,
      'No. FINCA, FOLIO Y LIBRO': inm.finca, 'DEPARTAMENTO': inm.departamento, 'MUNICIPIO': inm.municipio,
      'MATRICULA': inm.matricula, 'ARRENDAMIENTO MENSUAL': inm.renta, 'DIA DE PAGO': inm.diaPago,
      'FECHA DE VENCIMIENTO': inm.vencimiento, 'PROXIMA FECHA DE PAGO': c.proximo.toISOString().slice(0,10),
      'DIAS': c.diasPago, 'ESTADO': c.estado, 'OBSERVACION': c.obs
    };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Arrendamientos');
  const out = XLSX.write(wb, {type:'array', bookType:'xlsx'});
  const blob = new Blob([out], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if(window._dl){
    try{
      const buf = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await window._dl.save({filename:'arrendamientos_corporacion_charlie.xlsx', data:b64});
      return;
    }catch(e){}
  }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='arrendamientos_corporacion_charlie.xlsx'; a.click();
};

function showMsg(elId, text, ok){
  const el = document.getElementById(elId);
  el.textContent = text; el.className = 'msg show ' + (ok?'ok':'err');
  setTimeout(()=>el.classList.remove('show'), 6000);
}

async function persist(statusText){
  const st = document.getElementById('saveStatus');
  if(!artifactApi){ st.textContent = statusText ? statusText + ' (solo en esta pestaña; use "Descargar Excel" para conservarlo)' : ''; return; }
  st.textContent = 'Guardando...';
  try{
    document.getElementById('state').textContent = JSON.stringify(STATE);
    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    await artifactApi.publish(html);
    st.textContent = statusText || 'Guardado.';
  }catch(e){
    st.textContent = 'No se pudo guardar (' + (e && e.message ? e.message : 'reintente') + ').';
  }
}

render();
