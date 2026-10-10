import { ot } from '../../shared/lib/owner-i18n.js';
import React from 'react';
export const matchesStatus = (record,status) => !status || status==='all' || (status==='active' ? record.active===true : status==='inactive' ? record.active===false : record.status===status);
export const matches = (record, query) => !query.trim() || JSON.stringify(record).toLowerCase().includes(query.trim().toLowerCase());
import { statusLabel } from '../../shared/lib/owner-ui.js';
export function FilterBar({ value, onChange, search = true, dates = false, statuses = [], onReport, reportBusy, searchPlaceholder = 'Name, phone, order #...' }) {
  const change = (key, val) => onChange({ ...value, [key]: val, page: 1 });
  return <div className="data-toolbar">{search && <label>{ot("Search")}<input type="search" value={value.q || ''} onChange={e=>change('q',e.target.value)} placeholder={ot(searchPlaceholder)}/></label>}{statuses.length > 0 && <label>{ot("Status")}<select value={value.status || 'all'} onChange={e=>change('status',e.target.value)}><option value="all">{ot("All statuses")}</option>{statuses.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>}{dates && <><label>{ot("From (IST)")}<input type="date" value={value.from || ''} onChange={e=>change('from',e.target.value)}/></label><label>{ot("Through (IST)")}<input type="date" value={value.to || ''} min={value.from || undefined} onChange={e=>change('to',e.target.value)}/></label></>}<button type="button" className="btn btn-outline btn-small" onClick={()=>onChange({q:'',status:'all',from:'',to:'',page:1})}>{ot("Clear filters")}</button>{onReport && <button type="button" className="btn btn-green btn-small" disabled={reportBusy} onClick={onReport}>{reportBusy?ot("Downloading..."):ot("Download report (CSV)")}</button>}</div>;
}
export function Pages({ page, total, onChange, label = 'orders', size = 50 }) {
  const count = Math.max(1,Math.ceil(total/size));
  return <div className="data-pagination"><span>{total} {ot("matching")} {label} {ot("· page")} {page} {ot("of")} {count}</span><button className="btn btn-outline btn-small" disabled={page<=1} onClick={()=>onChange(page-1)}>{ot("Previous")}</button><button className="btn btn-outline btn-small" disabled={page>=count} onClick={()=>onChange(page+1)}>{ot("Next")}</button></div>;
}
