import { SALES_BASIS } from '../../shared/lib/owner-ui.js';
import { ot } from '../../shared/lib/owner-i18n.js';
import React from 'react';
import { inr } from '../../shared/lib/api.js';
import './sales-dashboard.css';

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const shortDate = key => { const [, m, d] = String(key).split('-'); return `${Number(d)} ${ot(MONTHS[Number(m) - 1]) || ''}`; };
const compact = n => { n = Number(n) || 0; return n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
const hourLabel = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
const PALETTE = ['#0e9f6e', '#4f7cff', '#f5a524', '#a855f7', '#ef5b7b', '#14b8c4', '#94a3b8'];
const STATUS_COLOR = { new: '#4f7cff', confirmed: '#14b8c4', packed: '#a855f7', shipped: '#f5a524', 'out-for-delivery': '#f59e0b', 'in-progress': '#a855f7', preparing: '#f5a524', delivered: '#0e9f6e', completed: '#0e9f6e', served: '#0e9f6e', cancelled: '#ef5b7b' };
const label = s => ot(String(s).replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()));
const pctDelta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function Delta({ cur, prev, note = 'vs previous 7 days' }) {
  const d = pctDelta(cur, prev);
  if (d === null) return null;
  return <em className={`sd-delta ${d >= 0 ? 'up' : 'down'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}% <span>{note}</span></em>;
}
function Spark({ values, color }) {
  if (!values.length || values.every(v => !v)) return <svg className="sd-spark" viewBox="0 0 100 28" aria-hidden="true"><line x1="0" y1="26" x2="100" y2="26" stroke={color} strokeOpacity=".3"/></svg>;
  const max = Math.max(...values, 1), step = values.length > 1 ? 100 / (values.length - 1) : 100;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(26 - (v / max) * 24).toFixed(1)}`).join(' ');
  return <svg className="sd-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/></svg>;
}
function Kpi({ i, title, value, note, spark, children }) {
  const color = PALETTE[i % PALETTE.length];
  return <div className="sd-kpi" style={{ '--c': color }}><span className="sd-kpi-title">{title}</span><strong>{value}</strong>{children}<small>{note}</small><Spark values={spark || []} color={color}/></div>;
}
function Panel({ title, sub, children, wide }) { return <section className={`dashboard-panel sd-panel${wide ? ' wide' : ''}`}><h3>{title}</h3>{sub && <p className="muted sd-sub">{sub}</p>}{children}</section>; }
const Empty = ({ children }) => <p className="empty-state sd-empty">{children}</p>;

// Area line for value + bars for count. Pure SVG, no library.
function TrendChart({ series, valueKey, countKey, valueLabel, countLabel, color = PALETTE[0] }) {
  const W = 640, H = 230, P = { l: 46, r: 12, t: 14, b: 28 }, n = series.length;
  const maxV = Math.max(1, ...series.map(s => s[valueKey])), maxC = Math.max(1, ...series.map(s => s[countKey]));
  const x = i => P.l + (n > 1 ? (i / (n - 1)) * (W - P.l - P.r) : (W - P.l - P.r) / 2), yv = v => P.t + (1 - v / maxV) * (H - P.t - P.b), yc = c => P.t + (1 - c / maxC) * (H - P.t - P.b);
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yv(s[valueKey]).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z`, bw = Math.max(2, Math.min(14, (W - P.l - P.r) / Math.max(n, 1) * 0.6));
  const ticks = [0, 0.5, 1], labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  return <div className="sd-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ot("{v0} and {v1} per day", {v0: valueLabel, v1: countLabel})}>
    <defs><linearGradient id={`g-${valueKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".38"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    {ticks.map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={yv(maxV * t)} y2={yv(maxV * t)} className="sd-grid"/><text x={P.l - 6} y={yv(maxV * t) + 4} textAnchor="end" className="sd-axis">{compact(maxV * t)}</text></g>)}
    {series.map((s, i) => s[countKey] > 0 && <rect key={s.date} x={x(i) - bw / 2} y={yc(s[countKey]) + (H - P.t - P.b) * 0.0} width={bw} height={Math.max(1, H - P.b - yc(s[countKey]))} rx="2" className="sd-bar-count" style={{ transform: 'none' }}/>)}
    <path d={area} fill={`url(#g-${valueKey})`} className="sd-area"/><path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" className="sd-line"/>
    {series.map((s, i) => <g key={`h${s.date}`} className="sd-hit"><rect x={x(i) - (W - P.l - P.r) / Math.max(n, 1) / 2} y={P.t} width={(W - P.l - P.r) / Math.max(n, 1)} height={H - P.t - P.b} fill="transparent"/><circle cx={x(i)} cy={yv(s[valueKey])} r="4" fill={color} className="sd-dot"/><title>{`${shortDate(s.date)}: ${inr(s[valueKey])} · ${s[countKey]} ${countLabel}`}</title></g>)}
    {labelIdx.map(i => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="sd-axis">{shortDate(series[i].date)}</text>)}
  </svg>
  <div className="sd-legend"><span><i style={{ background: color }}/>{valueLabel}</span><span><i className="bar"/>{countLabel}</span></div></div>;
}
function Donut({ parts, centerLabel }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <Empty>{ot("Nothing recorded yet.")}</Empty>;
  let acc = 0; const R = 42, C = 2 * Math.PI * R;
  return <div className="sd-donut"><svg viewBox="0 0 120 120" role="img" aria-label={centerLabel}><circle cx="60" cy="60" r={R} fill="none" stroke="rgba(128,128,128,.15)" strokeWidth="16"/>
    {parts.map(p => { const len = (p.value / total) * C, el = <circle key={p.label} cx="60" cy="60" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" className="sd-seg"><title>{`${p.label}: ${p.value}`}</title></circle>; acc += len; return el; })}
    <text x="60" y="58" textAnchor="middle" className="sd-donut-n">{total}</text><text x="60" y="73" textAnchor="middle" className="sd-donut-l">{centerLabel}</text></svg>
    <ul>{parts.map(p => <li key={p.label}><i style={{ background: p.color }}/>{p.label}<b>{p.value}</b></li>)}</ul></div>;
}
function HBars({ rows, fmt = v => v, color = PALETTE[0] }) {
  if (!rows.length) return <Empty>{ot("Nothing recorded yet.")}</Empty>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return <div className="sd-hbars">{rows.map((r, i) => <div className="sd-hrow" key={r.label}><span className="sd-hname" title={r.label}>{i + 1}. {r.label}</span><div className="sd-htrack"><i style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: color, animationDelay: `${i * 50}ms` }}/></div><b>{fmt(r.value)}</b>{r.sub && <small>{r.sub}</small>}</div>)}</div>;
}
function Hours({ hourly, peakHour }) {
  const max = Math.max(1, ...hourly);
  return <div><div className="sd-hours" role="img" aria-label={ot("Activity by hour of day")}>{hourly.map((v, h) => <div key={h} className="sd-hour" title={`${hourLabel(h)}: ${v}`}><i style={{ height: `${Math.max(v ? 8 : 3, (v / max) * 100)}%`, opacity: v ? 0.35 + 0.65 * (v / max) : 0.2 }}/></div>)}</div>
    <div className="sd-hour-axis"><span>{ot("12am")}</span><span>{ot("6am")}</span><span>{ot("12pm")}</span><span>{ot("6pm")}</span><span>{ot("11pm")}</span></div>{peakHour !== null && <p className="muted sd-sub">{ot("Busiest hour:")} <b>{hourLabel(peakHour)}</b> {ot("(IST)")}</p>}</div>;
}
function Weekdays({ weekday, peak }) {
  const max = Math.max(1, ...weekday), order = [1, 2, 3, 4, 5, 6, 0];
  return <div><div className="sd-week">{order.map(d => <div key={d} className={`sd-day${d === peak ? ' peak' : ''}`} title={`${ot(DAYS[d])}: ${weekday[d]}`}><i style={{ height: `${Math.max(weekday[d] ? 10 : 4, (weekday[d] / max) * 100)}%` }}/><span>{ot(DAYS[d])}</span></div>)}</div>{peak !== null && <p className="muted sd-sub">{ot("Busiest day:")} <b>{ot(DAYS[peak])}</b></p>}</div>;
}
const statusParts = obj => Object.entries(obj || {}).map(([k, v], i) => ({ label: ot(label(k)), value: v, color: STATUS_COLOR[k] || PALETTE[i % PALETTE.length] })).sort((a, b) => b.value - a.value);
const sparkOf = (series, key) => series.slice(-14).map(s => s[key]);
const Note = ({ r }) => <p className="muted sd-note">{ot(r.caveat)}</p>;

export default function SalesAnalytics({ report, products = [], storeType = 'retail' }) {
  const r = report || {}, ins = r.insights, days = r.daily || [];
  if (!ins) return <div className="sales-analytics"><Empty>{ot("Loading analytics...")}</Empty></div>;
  const series = ins.series || [], w = ins.week || { last7: {}, prev7: {} };
  const restaurant = storeType === 'restaurant', services = storeType === 'services';

  if (!restaurant) {
    const noun = services ? ot("booking requests") : ot("enquiries"), one = services ? ot("request") : ot("enquiry"), topTitle = services ? ot("Most requested services") : ot("Most enquired products"), f = ins.fulfilment || {};
    const doneRate = f.total ? Math.round((f.done / f.total) * 100) : 0, c = ins.customers || {};
    return <div className="sales-analytics sd">
      <div className="sd-kpis six">
        <Kpi i={0} title={services ? ot("Booking requests") : ot("WhatsApp enquiries")} value={r.whatsappEnquiries || 0} note={ot("Requests received in the selected date range")} spark={sparkOf(series, 'enquiries')}><Delta cur={w.last7.enquiries} prev={w.prev7.enquiries}/></Kpi>
        <Kpi i={1} title={ot("{v0} value", {v0: ot(services ? 'Request' : 'Enquiry')})} value={inr(r.enquiryValue)} note={ot("Requests only, not confirmed sales")} spark={sparkOf(series, 'enquiryValue')}><Delta cur={w.last7.enquiryValue} prev={w.prev7.enquiryValue}/></Kpi>
        <Kpi i={2} title={ot("Earnings")} value={inr(r.recordedTotal)} note={ot("{v0} {v1} {v2} in this range", {v0: r.retailDelivered || 0, v1: ot(services ? 'completed' : 'delivered'), v2: ot(services ? (r.retailDelivered === 1 ? 'booking' : 'bookings') : (r.retailDelivered === 1 ? 'order' : 'orders'))})} spark={sparkOf(series, 'servedValue')}><Delta cur={w.last7.servedValue} prev={w.prev7.servedValue}/></Kpi>
        <Kpi i={3} title={ot("Average {v0}", {v0: one})} value={inr(ins.avgEnquiry)} note={ot("Value of a typical request")} spark={sparkOf(series, 'enquiries')}/>
        <Kpi i={4} title={services ? ot("Completed") : ot("Delivered")} value={`${doneRate}%`} note={ot("{v0} of {v1} {v2} reached the end", {v0: f.done || 0, v1: f.total || 0, v2: noun})}/>
        <Kpi i={5} title={ot("Repeat customers")} value={c.repeat || 0} note={ot("{v0} customers left a phone number", {v0: c.identified || 0})}/>
      </div>
      <div className="sd-grid-2">
        <Panel wide title={ot("{v0} over time", {v0: ot(services ? 'Booking requests' : 'Enquiries')})} sub={ot("Daily {v0} (bars) and their value (line), last {v1} days, IST", {v0: noun, v1: ins.seriesDays})}>{series.some(s => s.enquiries) ? <TrendChart series={series} valueKey="enquiryValue" countKey="enquiries" valueLabel={ot("{v0}{v1} value", {v0: one[0].toUpperCase(), v1: one.slice(1)})} countLabel={noun}/> : <Empty>{ot("No {noun} in this date range.", {noun})}</Empty>}</Panel>
        <Panel title={ot("Where requests stand")} sub={ot("Current status of every request")}><Donut parts={statusParts(ins.leadStatus)} centerLabel={noun}/></Panel>
      </div>
      <div className="sd-grid-3">
        <Panel title={topTitle} sub={ot("By units requested. Cancelled requests are left out.")}><HBars rows={(ins.topEnquired || []).map(p => ({ label: p.name, value: p.units, sub: `${p.enquiries} ${p.enquiries === 1 ? one : noun} · ${inr(p.value)}` }))} color={PALETTE[1]}/></Panel>
        <Panel title={ot("Busiest hours")} sub={ot("When customers reach out")}><Hours hourly={ins.hourly} peakHour={ins.peakHour}/></Panel>
        <Panel title={ot("Busiest days")} sub={ot("Across the selected range")}><Weekdays weekday={ins.weekday} peak={ins.peakWeekday}/></Panel>
      </div>
      {!!ins.coupons?.length && <Panel title={ot("Coupons in use")}><HBars color={PALETTE[2]} rows={ins.coupons.map(x => ({ label: x.code, value: x.uses, sub: ot('{v0} discount',{v0:inr(x.discount)}) }))} fmt={v => ot('{v0} uses',{v0:v})}/></Panel>}
      <section className="dashboard-panel"><h3>{ot("How to read this")}</h3><p className="muted">{ot("Customers order on WhatsApp or in the shop, so payments are not recorded here and")} {noun} {ot("are never counted as sales. Track each request and its status under Orders.")}</p></section>
    </div>;
  }

  return <div className="sales-analytics sd">
      {r.bills?.count > 0 && <div className="bills-strip" role="group" aria-label={ot("Table bills settled")}>
        <div><small>{ot("Bills paid in range")}</small><b>{r.bills.count}</b></div>
        <div><small>{ot("Billed total (paid bills)")}</small><b>{inr(r.bills.total)}</b></div>
        <div><small>{ot("GST")}</small><b>{inr(r.bills.gst)}</b></div>
        <div><small>{ot("Extra charges")}</small><b>{inr(r.bills.charges)}</b></div>
        <div><small>{ot("Discounts")}</small><b>{inr(r.bills.discounts)}</b></div>
        {r.bills.byMode && <><div><small>{ot("Cash")}</small><b>{inr(r.bills.byMode.cash)}</b></div><div><small>{ot("UPI")}</small><b>{inr(r.bills.byMode.upi)}</b></div><div><small>{ot("Card")}</small><b>{inr(r.bills.byMode.card)}</b></div></>}
        <p className="muted">{ot(SALES_BASIS.billed)} {ot(SALES_BASIS.differ)} {ot("Full bill history is under Tables.")}</p>
      </div>}
    <div className="sd-kpis">
      <Kpi i={0} title={ot("Earnings")} value={inr(r.recordedTotal)} note={ot("Served value by order date, not verified payments")} spark={sparkOf(series, 'servedValue')}><Delta cur={w.last7.servedValue} prev={w.prev7.servedValue}/></Kpi>
      <Kpi i={1} title={ot("Served orders")} value={r.completedOrders || 0} note={ot("In the selected order-created date range")} spark={sparkOf(series, 'servedOrders')}><Delta cur={w.last7.servedOrders} prev={w.prev7.servedOrders}/></Kpi>
      <Kpi i={2} title={ot("Average served order")} value={inr(r.averageOrder)} note={ot("Recorded value divided by served orders")}/>
      <Kpi i={3} title={ot("Today / this month")} value={inr(r.today)} note={ot("{v0} so far this month. Served value by order date.", {v0:inr(r.month)})}/>
      <Kpi i={4} title={ot("Open right now")} value={r.restaurantPending || 0} note={ot("Not yet served (new, accepted, preparing, ready). {v0} cancelled in this range", {v0:r.cancelledOrders || 0})}/>
    </div>
    <div className="sd-grid-2">
      <Panel wide title={ot("Served order value over time")} sub={ot("Recorded value (line) and all orders placed (bars), last {v0} days, IST", {v0: ins.seriesDays})}>{series.some(s => s.orders || s.servedOrders) ? <TrendChart series={series} valueKey="servedValue" countKey="orders" valueLabel={ot("Served value")} countLabel={ot("orders placed")}/> : <Empty>{ot("No orders in this date range.")}</Empty>}</Panel>
      <Panel title={ot("Order types")} sub={ot("Dine-in, takeaway and delivery")}><Donut parts={statusParts(ins.orderTypes).map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] }))} centerLabel={ot("orders")}/></Panel>
    </div>
    <div className="sd-grid-3">
      <Panel title={ot("Best sellers")} sub={ot("Units across all orders that were not cancelled")}><HBars rows={(ins.topDishes || []).map(p => ({ label: p.name, value: p.units, sub: inr(p.value) }))} fmt={v => ot('{v0} sold',{v0:v})}/></Panel>
      <Panel title={ot("Rush hours")} sub={ot("When orders come in")}><Hours hourly={ins.hourly} peakHour={ins.peakHour}/></Panel>
      <Panel title={ot("Busiest days")} sub={ot("Across the selected range")}><Weekdays weekday={ins.weekday} peak={ins.peakWeekday}/></Panel>
    </div>
    <div className="sd-grid-3">
      <Panel title={ot("Order status")} sub={ot("Where every order stands")}><Donut parts={statusParts(ins.orderStatus)} centerLabel={ot("orders")}/></Panel>
      <Panel title={ot("Busiest tables")} sub={ot("Dine-in orders per table")}><HBars color={PALETTE[3]} rows={(ins.tables || []).map(t => ({ label: ot('Table {v0}',{v0:t.table}), value: t.orders, sub: inr(t.value) }))} fmt={v => ot('{v0} orders',{v0:v})}/></Panel>
      <Panel title={ot("Customers")} sub={ot("Who is coming back")}><div className="sd-people"><div><b>{ins.customers?.identified || 0}</b><span>{ot("with a phone number")}</span></div><div><b>{ins.customers?.repeat || 0}</b><span>{ot("ordered more than once")}</span></div></div>{!!ins.coupons?.length && <><h4 className="sd-h4">{ot("Coupons in use")}</h4><HBars color={PALETTE[2]} rows={ins.coupons.map(x => ({ label: x.code, value: x.uses, sub: ot('{v0} off',{v0:inr(x.discount)}) }))} fmt={v => ot('{v0} uses',{v0:v})}/></>}</Panel>
    </div>
    <Panel title={ot("Best sellers table")} sub={ot("Units in served orders. Item value is before order discounts and delivery.")}><div className="table-wrap"><table><thead><tr><th>{ot("Rank")}</th><th>{ot("Item")}</th><th>{ot("Units")}</th><th>{ot("Item value")}</th></tr></thead><tbody>{(r.topProducts || []).map((p, i) => <tr key={p.name}><td><span className="rank-pill">{i + 1}</span></td><td>{p.name}</td><td>{p.quantity}</td><td>{inr(p.itemValue)}</td></tr>)}</tbody></table></div>{!r.topProducts?.length && <p>{ot("No served items recorded yet.")}</p>}</Panel>
    <Panel title={ot("Stock needing attention")} sub={ot("Stocked items with no units in served orders in this date range. This is a no-recorded-movement list, not proof of unsold stock.")}><div className="table-wrap"><table><thead><tr><th>{ot("Item")}</th><th>{ot("Stock")}</th><th>{ot("Listed price")}</th></tr></thead><tbody>{(r.noMovement || []).map(p => <tr key={p.id}><td>{p.name}</td><td>{p.stock}</td><td>{inr(p.price)}</td></tr>)}</tbody></table></div>{!r.noMovement?.length && <p>{ot("No stocked items without recorded movement.")}</p>}</Panel>
    <Note r={r}/>
  </div>;
}
