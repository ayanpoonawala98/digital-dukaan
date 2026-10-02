import React from 'react';
export const matchesStatus = (record,status) => !status || status==='all' || (status==='active' ? record.active===true : status==='inactive' ? record.active===false : record.status===status);
export const matches = (record, query) => !query.trim() || JSON.stringify(record).toLowerCase().includes(query.trim().toLowerCase());
export function FilterBar({ value, onChange, search = true, dates = false, statuses = [], onReport, reportBusy }) {
  const change = (key, val) => onChange({ ...value, [key]: val, page: 1 });
  return <div className="data-toolbar">{search && <label>Search<input type="search" value={value.q || ''} onChange={e=>change('q',e.target.value)} placeholder="Name, phone, order #..."/></label>}{statuses.length > 0 && <label>Status<select value={value.status || 'all'} onChange={e=>change('status',e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label>}{dates && <><label>From (IST)<input type="date" value={value.from || ''} onChange={e=>change('from',e.target.value)}/></label><label>Through (IST)<input type="date" value={value.to || ''} min={value.from || undefined} onChange={e=>change('to',e.target.value)}/></label></>}<button type="button" className="btn btn-outline btn-small" onClick={()=>onChange({q:'',status:'all',from:'',to:'',page:1})}>Clear filters</button>{onReport && <button type="button" className="btn btn-green btn-small" disabled={reportBusy} onClick={onReport}>{reportBusy?'Downloading...':'Download report (CSV)'}</button>}</div>;
}
export function Pages({ page, total, onChange }) {
  const count = Math.max(1,Math.ceil(total/50));
  return <div className="data-pagination"><span>{total} matching orders · page {page} of {count}</span><button className="btn btn-outline btn-small" disabled={page<=1} onClick={()=>onChange(page-1)}>Previous</button><button className="btn btn-outline btn-small" disabled={page>=count} onClick={()=>onChange(page+1)}>Next</button></div>;
}
